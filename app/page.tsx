```tsx
"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import {
  Home,
  MessageCircle,
  Menu,
  X,
  TrendingUp,
  Bell,
  Bot,
  User,
  Send,
  Plus,
  History,
  SquarePen,
  Mic,
  Volume2,
  TrendingDown,
  DollarSign,
  BarChart3,
  Play,
  Save,
  FileText,
  Settings,
  Trash2,
  Edit2
} from "lucide-react"
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import { FirebaseProvider, useFirebase } from '@/components/FirebaseProvider'
import {
  collection,
  query,
  getDocs,
  addDoc,
  deleteDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  where,
  serverTimestamp,
  doc,
  orderBy
} from 'firebase/firestore'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'

const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || "http://127.0.0.1:10000"
console.log("DIAG: Initial BACKEND_BASE_URL:", BACKEND_BASE_URL)
const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id'
console.log("DIAG: Initial appId:", appId)

interface PriceDetail {
  price: string
  percentage_change: string
}

interface AnalysisResult {
  confidence_score: string
  signal_strength: string
  market_summary: string
  stop_loss: PriceDetail
  take_profit_1: PriceDetail
  take_profit_2: PriceDetail
  technical_indicators_analysis: string
  next_step_for_user: string
  ormcr_confirmation_status: string
  ormcr_overall_bias: string
  ormcr_reason: string
  symbol: string
  ai_suggestion: {
    entry_type: string
    recommended_action: string
    position_size: string
    entry_price: string
    direction: string
    confidence: string
    signal: string
  }
}

interface MarketData {
  price: number | string
  percent_change: number | string
  rsi: number | string
  macd: number | string
  stoch_k: number | string
  volume: number | string
  orscr_signal: string
}

interface AllMarketPrices {
  [key: string]: MarketData
}

interface ChatSession {
  id: string
  name: string
  createdAt: any
  lastMessageText: string
  lastMessageTimestamp?: any
}

interface TradeLogEntry {
  id: string
  currencyPair: string
  entryPrice: number
  exitPrice: number
  volume: number
  profitOrLoss: number
  timestamp: any
  journalEntry?: string
}

interface ChatMessage {
  id: string
  sender: 'user' | 'ai'
  text: string
  timestamp?: any
  type?: 'text' | 'audio' | 'analysis'
  audioUrl?: string
  analysis?: AnalysisResult
}

const CustomAlert: React.FC<{ message: string; type: 'success' | 'error' | 'warning' | 'info'; onClose: () => void }> = ({ message, type, onClose }) => {
  const bgColor = {
    success: 'bg-emerald-600/80',
    error: 'bg-red-600/80',
    warning: 'bg-amber-600/80',
    info: 'bg-blue-600/80'
  }[type]

  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className={`fixed top-4 right-4 z-50 ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg backdrop-blur-sm transform transition-transform duration-300 translate-x-0`}>
      <div className="flex items-center justify-between">
        <span>{message}</span>
        <button onClick={onClose} className="ml-3 text-white/70 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

const CustomConfirmModal: React.FC<{
  message: string
  onConfirm: () => void
  onCancel: () => void
}> = ({ message, onConfirm, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900/90 rounded-lg p-6 shadow-xl border border-purple-500/20 max-w-sm mx-auto">
        <p className="text-gray-200 text-lg mb-6">{message}</p>
        <div className="flex justify-end space-x-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-gray-800/50 text-gray-300 hover:bg-gray-700/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-red-600/80 text-white hover:bg-red-700/80 transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TradingDashboardWrapper() {
  return (
    <FirebaseProvider>
      <TradingDashboardContent />
    </FirebaseProvider>
  )
}

function TradingDashboardContent() {
  const { db, userId, isAuthReady } = useFirebase()
  const [activeView, setActiveView] = useState("dashboard")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentAlert, setCurrentAlert] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null)
  const [isChatHistoryMobileOpen, setIsChatHistoryMobileOpen] = useState(false)
  const [marketPrices, setMarketPrices] = useState<AllMarketPrices>({})
  const [loadingPrices, setLoadingPrices] = useState(true)
  const [errorPrices, setErrorPrices] = useState<string | null>(null)
  const [currentLivePrice, setCurrentLivePrice] = useState<string>('N/A')
  const [messageInput, setMessageInput] = useState("")
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const chatMessagesEndRef = useRef<HTMLDivElement>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [currentChatSessionId, setCurrentChatSessionId] = useState<string | null>(null)
  const [isVoiceRecording, setIsVoiceRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const [aiAssistantName] = useState("Aura")
  const [analysisCurrencyPair, setAnalysisCurrencyPair] = useState("BTC/USD")
  const [analysisTimeframes, setAnalysisTimeframes] = useState<string[]>([])
  const [analysisTradeType, setAnalysisTradeType] = useState("Scalp (Quick trades)")
  const [analysisIndicators, setAnalysisIndicators] = useState<string[]>([
    "RSI", "MACD", "Moving Averages", "Bollinger Bands", "Stochastic Oscillator", "Volume", "ATR", "Fibonacci Retracements"
  ])
  const [analysisBalance, setAnalysisBalance] = useState("10000")
  const [analysisLeverage, setAnalysisLeverage] = useState("1x (No Leverage)")
  const [analysisResults, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const availableTimeframes = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"]
  const availableIndicators = [
    { name: "RSI", desc: "Relative Strength Index" },
    { name: "Stochastic Oscillator", desc: "Momentum oscillator" },
    { name: "MACD", desc: "Moving Average Convergence" },
    { name: "Moving Averages", desc: "SMA/EMA trends" },
    { name: "Bollinger Bands", desc: "Volatility bands" },
    { name: "Volume", desc: "Trading volume analysis" },
    { name: "ATR", desc: "Average True Range" },
    { name: "Fibonacci Retracements", desc: "Key structural levels" },
  ]
  const [tradeLogs, setTradeLogs] = useState<TradeLogEntry[]>([])
  const [loadingTradeLogs, setLoadingTradeLogs] = useState(true)
  const [tradeLogForm, setTradeLogForm] = useState({
    currencyPair: "BTC/USD",
    entryPrice: "",
    exitPrice: "",
    volume: "",
    profitOrLoss: "",
  })
  const [isAddingTrade, setIsAddingTrade] = useState(false)
  const [journalEntry, setJournalEntry] = useState("")
  const [selectedTradeForJournal, setSelectedTradeForJournal] = useState<string | null>(null)
  const [isSavingJournal, setIsSavingJournal] = useState(false)
  const [tradeLogError, setTradeLogError] = useState<string | null>(null)
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false)
  const [tradeIdToDelete, setTradeIdToDelete] = useState<string | null>(null)
  const [backendUrlSetting] = useState(BACKEND_BASE_URL)

  const handleNewConversation = useCallback(async () => {
    if (!db || !userId || !isAuthReady) {
      setCurrentAlert({ message: "Chat service not ready. Please wait a moment.", type: "warning" })
      console.warn("DIAG: Firebase not ready. db:", !!db, "userId:", !!userId, "isAuthReady:", isAuthReady)
      return null
    }
    console.log("DIAG: Creating new chat session...")
    try {
      const sessionsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/chatSessions`)
      const newSessionRef = await addDoc(sessionsCollectionRef, {
        name: "New Chat " + new Date().toLocaleString().split(',')[0],
        createdAt: serverTimestamp(),
        lastMessageText: "No messages yet.",
      })
      setMessageInput('')
      setChatMessages([])
      setIsChatHistoryMobileOpen(false)
      setCurrentAlert({ message: "New conversation started!", type: "success" })
      console.log("DIAG: New chat session created with ID:", newSessionRef.id)
      const messagesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${newSessionRef.id}/messages`)
      const initialGreeting: ChatMessage = {
        id: crypto.randomUUID(),
        sender: 'ai',
        text: `Hello! I'm ${aiAssistantName}, your AI trading assistant. How can I help you today?`,
        timestamp: serverTimestamp(),
        type: 'text'
      }
      await addDoc(messagesCollectionRef, initialGreeting)
      console.log("DIAG: Initial greeting added.")
      return newSessionRef.id
    } catch (error: any) {
      console.error("DIAG: Error creating new conversation:", error)
      setCurrentAlert({ message: `Failed to start new conversation: ${error.message}`, type: "error" })
      return null
    }
  }, [db, userId, isAuthReady, aiAssistantName, appId])

  const handleSwitchConversation = (sessionId: string) => {
    setCurrentChatSessionId(sessionId)
    setIsChatHistoryMobileOpen(false)
    setMessageInput('')
    setCurrentAlert({ message: "Switched to selected conversation.", type: "info" })
    console.log("DIAG: Switched to conversation ID:", sessionId)
  }

  const fetchWithRetry = async (url: string, options: RequestInit, retries = 3): Promise<Response> => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options)
        if (response.ok) return response
        throw new Error(`HTTP error! Status: ${response.status}`)
      } catch (error: any) {
        if (i === retries - 1) throw error
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
      }
    }
    throw new Error("Max retries reached")
  }

  const handleORMCRAnalysisRequest = useCallback(async (symbol: string) => {
    const analysisPendingMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sender: 'ai',
      type: 'text',
      text: `Retrieving ORMCR analysis for ${symbol}...`,
      timestamp: db ? serverTimestamp() : null,
    }
    if (db && userId && currentChatSessionId && isAuthReady) {
      await addDoc(collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`), analysisPendingMessage)
    } else {
      setChatMessages(prev => [...prev, analysisPendingMessage])
    }

    try {
      const response = await fetchWithRetry(`${BACKEND_BASE_URL}/run_ormcr_analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, userId }),
      })
      const analysisResult: AnalysisResult = await response.json()
      if (!analysisResult.ai_suggestion || !analysisResult.ai_suggestion.entry_price) {
        throw new Error("Invalid analysis response: Missing required fields")
      }
      console.log("DIAG: ORMCR Analysis Result:", analysisResult)

      if (db && userId && currentChatSessionId && isAuthReady) {
        const messagesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`)
        const q = query(messagesCollectionRef, where('id', '==', analysisPendingMessage.id))
        const querySnapshot = await getDocs(q)
        querySnapshot.forEach(async docRef => await deleteDoc(docRef.ref))
      } else {
        setChatMessages(prev => prev.filter(msg => msg.id !== analysisPendingMessage.id))
      }

      const aiAnalysisMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sender: 'ai',
        type: 'analysis',
        text: `ORMCR analysis for ${symbol}:`,
        timestamp: db ? serverTimestamp() : null,
        analysis: analysisResult,
      }

      if (db && userId && currentChatSessionId && isAuthReady) {
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`), aiAnalysisMessage)
        console.log("DIAG: AI analysis message added to Firestore.")
      } else {
        setChatMessages(prev => [...prev, aiAnalysisMessage])
      }
      setCurrentAlert({ message: "ORMCR Analysis completed!", type: "success" })
    } catch (error: any) {
      console.error("DIAG: Error requesting ORMCR analysis:", error)
      if (db && userId && currentChatSessionId && isAuthReady) {
        const messagesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`)
        const q = query(messagesCollectionRef, where('id', '==', analysisPendingMessage.id))
        const querySnapshot = await getDocs(q)
        querySnapshot.forEach(async docRef => await deleteDoc(docRef.ref))
      } else {
        setChatMessages(prev => prev.filter(msg => msg.id !== analysisPendingMessage.id))
      }
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sender: 'ai',
        type: 'text',
        text: `Error requesting ORMCR analysis for ${symbol}: ${error.message || "Unknown error"}.`,
        timestamp: db ? serverTimestamp() : null,
      }
      if (db && userId && currentChatSessionId && isAuthReady) {
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`), errorMessage)
      } else {
        setChatMessages(prev => [...prev, errorMessage])
      }
      setCurrentAlert({ message: `Analysis failed: ${error.message || "Unknown error"}.`, type: "error" })
    }
  }, [db, userId, currentChatSessionId, isAuthReady, appId, BACKEND_BASE_URL])

  const fetchBackendChatResponse = useCallback(async (requestBody: any) => {
    try {
      const response = await fetchWithRetry(`${BACKEND_BASE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      })
      const data = await response.json()
      const aiResponseText = data.response || "No response from AI."

      if (aiResponseText.includes("ORMCR_ANALYSIS_REQUESTED:")) {
        const messageParts = aiResponseText.split("ORMCR_ANALYSIS_REQUESTED:")
        const symbol = messageParts[1].trim()
        await handleORMCRAnalysisRequest(symbol)
      } else {
        const aiMessage: ChatMessage = {
          id: crypto.randomUUID(),
          sender: "ai",
          text: aiResponseText,
          timestamp: db ? serverTimestamp() : null,
          type: 'text'
        }
        console.log("DIAG: AI response received:", data)
        if (db && userId && currentChatSessionId && isAuthReady) {
          await addDoc(collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`), aiMessage)
          const sessionDocRef = doc(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}`)
          await setDoc(sessionDocRef, {
            lastMessageText: aiMessage.text,
            lastMessageTimestamp: aiMessage.timestamp,
          }, { merge: true })
        }
      }
    } catch (error: any) {
      console.error("DIAG: Error communicating with backend:", error)
      setCurrentAlert({ message: `Failed to get AI response: ${error.message || "Unknown error"}.`, type: "error" })
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sender: "ai",
        text: `Error: ${error.message || "Unknown error"}. Check backend status.`,
        timestamp: db ? serverTimestamp() : null,
        type: 'text'
      }
      if (db && userId && currentChatSessionId && isAuthReady) {
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`), errorMessage)
      } else {
        setChatMessages(prev => [...prev, errorMessage])
      }
    } finally {
      setIsSendingMessage(false)
      console.log("DIAG: Backend fetch finished.")
    }
  }, [db, userId, currentChatSessionId, isAuthReady, handleORMCRAnalysisRequest, appId, BACKEND_BASE_URL])

  const handleSendMessage = useCallback(async (isVoice = false, audioBlob?: Blob) => {
    if (!messageInput.trim() && !isVoice) {
      console.log("DIAG: handleSendMessage aborted: empty message.")
      return
    }
    if (!db || !userId || !currentChatSessionId || !isAuthReady) {
      setCurrentAlert({ message: "Chat service not ready.", type: "warning" })
      console.warn("DIAG: Firebase not ready. db:", !!db, "userId:", !!userId, "currentChatSessionId:", !!currentChatSessionId, "isAuthReady:", isAuthReady)
      return
    }

    const messageContent = messageInput.trim()
    const messageType = isVoice ? 'audio' : 'text'
    setIsSendingMessage(true)
    setMessageInput("")

    try {
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sender: "user",
        text: messageContent,
        timestamp: serverTimestamp(),
        type: messageType,
      }

      if (isVoice && audioBlob) {
        const storage = getStorage()
        const audioRef = ref(storage, `artifacts/${appId}/users/${userId}/audio/${userMessage.id}.webm`)
        await uploadBytes(audioRef, audioBlob)
        userMessage.audioUrl = await getDownloadURL(audioRef)
      }

      await addDoc(collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`), userMessage)
      console.log("DIAG: User message added to Firestore.")

      const sessionDocRef = doc(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}`)
      const isFirstMessageInNewSession = chatMessages.length === 1 && chatMessages[0].sender === 'ai'
      const currentSession = chatSessions.find(s => s.id === currentChatSessionId)
      const isSessionNameGeneric = currentSession && currentSession.name.startsWith("New Chat")
      let newSessionName = currentSession?.name || "Untitled Chat"
      if (isFirstMessageInNewSession || isSessionNameGeneric) {
        newSessionName = userMessage.text.substring(0, 30) + (userMessage.text.length > 30 ? '...' : '')
      }
      await setDoc(sessionDocRef, {
        lastMessageText: userMessage.text,
        lastMessageTimestamp: userMessage.timestamp,
        name: newSessionName,
      }, { merge: true })

      const payloadHistory = chatMessages
        .filter(msg => msg.id !== 'initial-greeting')
        .map(msg => ({ role: msg.sender === "user" ? "user" : "model", text: msg.text }))
      payloadHistory.push({ role: 'user', text: userMessage.text })

      const requestBody: any = {
        session_id: currentChatSessionId,
        user_id: userId,
        message: userMessage.text,
        message_type: messageType,
        chatHistory: payloadHistory
      }

      if (isVoice && audioBlob) {
        const reader = new FileReader()
        reader.readAsDataURL(audioBlob)
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1]
          requestBody.audio_data = base64Audio
          await fetchBackendChatResponse(requestBody)
        }
      } else {
        await fetchBackendChatResponse(requestBody)
      }
    } catch (error: any) {
      console.error("DIAG: Error in handleSendMessage:", error)
      setCurrentAlert({ message: `Error sending message: ${error.message || "Unknown error"}`, type: "error" })
      setIsSendingMessage(false)
    }
  }, [messageInput, db, userId, currentChatSessionId, isAuthReady, chatMessages, chatSessions, fetchBackendChatResponse, appId])

  const handleStartVoiceRecording = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator.mediaDevices) {
      setCurrentAlert({ message: "Voice recording not supported.", type: "error" })
      return
    }
    if (!currentChatSessionId) {
      setCurrentAlert({ message: "Start a new chat session first.", type: "warning" })
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      mediaRecorderRef.current.ondataavailable = event => audioChunksRef.current.push(event.data)
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setMessageInput("[Voice Message]")
        await handleSendMessage(true, audioBlob)
        audioChunksRef.current = []
        stream.getTracks().forEach(track => track.stop())
      }
      mediaRecorderRef.current.start()
      setIsVoiceRecording(true)
      setCurrentAlert({ message: "Recording voice...", type: "info" })
    } catch (err: any) {
      console.error("DIAG: Error accessing microphone:", err)
      setCurrentAlert({ message: `Failed to start recording: ${err.message}`, type: "error" })
    }
  }, [currentChatSessionId, handleSendMessage])

  const handleStopVoiceRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
      setIsVoiceRecording(false)
      setCurrentAlert({ message: "Voice recording stopped.", type: "info" })
    }
  }, [])

  const handleRunAnalysis = async () => {
    if (!analysisCurrencyPair || analysisTimeframes.length === 0 || !analysisBalance || !analysisLeverage) {
      setCurrentAlert({ message: "Please fill all analysis fields.", type: "warning" })
      return
    }
    setIsAnalyzing(true)
    setAnalysisError(null)
    setAnalysisResult(null)

    const analysisInput = {
      currencyPair: analysisCurrencyPair,
      timeframes: analysisTimeframes,
      tradeType: analysisTradeType,
      indicators: analysisIndicators,
      availableBalance: parseFloat(analysisBalance),
      leverage: analysisLeverage.includes('x (No Leverage)') ? 1 : parseFloat(analysisLeverage.replace('x', '')),
    }
    try {
      const response = await fetchWithRetry(`${BACKEND_BASE_URL}/run_ormcr_analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...analysisInput, userId }),
      })
      const data: AnalysisResult = await response.json()
      if (!data.ai_suggestion || !data.ai_suggestion.entry_price) {
        throw new Error("Invalid analysis response: Missing required fields")
      }
      setAnalysisResult(data)
      setCurrentAlert({ message: "Analysis completed!", type: "success" })
    } catch (error: any) {
      console.error("DIAG: Error running analysis:", error)
      setAnalysisError(error.message || "Failed to run analysis.")
      setCurrentAlert({ message: `Analysis failed: ${error.message || "Unknown error"}`, type: "error" })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleIndicatorChange = (indicatorName: string) => {
    setAnalysisIndicators(prev =>
      prev.includes(indicatorName)
        ? prev.filter(name => name !== indicatorName)
        : [...prev, indicatorName]
    )
  }

  const handleTimeframeButtonClick = (tf: string) => {
    setAnalysisTimeframes(prev => {
      const newTimeframes = prev.includes(tf)
        ? prev.filter(selectedTf => selectedTf !== tf)
        : [...prev, tf]
      const order = ['D1', 'H4', 'H1', 'M30', 'M15', 'M5', 'M1']
      return newTimeframes.sort((a, b) => order.indexOf(a) - order.indexOf(b))
    })
  }

  const handleChatAboutAnalysis = () => {
    if (analysisResults && analysisResults.market_summary) {
      setMessageInput(`Regarding the recent analysis for ${analysisCurrencyPair}:\n\n${analysisResults.market_summary}\n\nWhat do you think?`)
      setActiveView("chat")
    } else {
      setCurrentAlert({ message: "No analysis results to discuss.", type: "warning" })
    }
  }

  const handleAddTradeLog = async () => {
    if (!tradeLogForm.currencyPair || !tradeLogForm.entryPrice || !tradeLogForm.exitPrice || !tradeLogForm.volume) {
      setCurrentAlert({ message: "Please fill all trade log fields.", type: "warning" })
      return
    }
    if (!db || !userId || !isAuthReady) {
      setCurrentAlert({ message: "Trade log service not ready.", type: "warning" })
      return
    }
    setIsAddingTrade(true)
    setTradeLogError(null)
    try {
      const entryPriceNum = parseFloat(tradeLogForm.entryPrice)
      const exitPriceNum = parseFloat(tradeLogForm.exitPrice)
      const volumeNum = parseFloat(tradeLogForm.volume)
      if (isNaN(entryPriceNum) || isNaN(exitPriceNum) || isNaN(volumeNum)) {
        throw new Error("Invalid number format.")
      }
      const profitOrLoss = (exitPriceNum - entryPriceNum) * volumeNum
      const tradeLogEntry = {
        currencyPair: tradeLogForm.currencyPair,
        entryPrice: entryPriceNum,
        exitPrice: exitPriceNum,
        volume: volumeNum,
        profitOrLoss: parseFloat(profitOrLoss.toFixed(2)),
        timestamp: serverTimestamp(),
      }
      await addDoc(collection(db, `artifacts/${appId}/users/${userId}/tradeLogs`), tradeLogEntry)
      setCurrentAlert({ message: "Trade log added!", type: "success" })
      setTradeLogForm({
        currencyPair: "BTC/USD",
        entryPrice: "",
        exitPrice: "",
        volume: "",
        profitOrLoss: "",
      })
    } catch (error: any) {
      console.error("DIAG: Error adding trade log:", error)
      setTradeLogError(error.message || "Failed to add trade log.")
      setCurrentAlert({ message: `Failed to add trade log: ${error.message}`, type: "error" })
    } finally {
      setIsAddingTrade(false)
    }
  }

  const handleSaveJournalEntry = async () => {
    if (!selectedTradeForJournal || !journalEntry.trim()) {
      setCurrentAlert({ message: "Select a trade and write a journal entry.", type: "warning" })
      return
    }
    if (!db || !userId || !isAuthReady) {
      setCurrentAlert({ message: "Journal save service not ready.", type: "warning" })
      return
    }
    setIsSavingJournal(true)
    setTradeLogError(null)
    try {
      const tradeDocRef = doc(db, `artifacts/${appId}/users/${userId}/tradeLogs`, selectedTradeForJournal)
      await updateDoc(tradeDocRef, { journalEntry })
      setCurrentAlert({ message: "Journal entry saved!", type: "success" })
      setJournalEntry("")
      setSelectedTradeForJournal(null)
    } catch (error: any) {
      console.error("DIAG: Error saving journal:", error)
      setTradeLogError(error.message || "Failed to save journal.")
      setCurrentAlert({ message: `Failed to save journal: ${error.message}`, type: "error" })
    } finally {
      setIsSavingJournal(false)
    }
  }

  const handleDeleteTradeLogClick = (tradeId: string) => {
    setTradeIdToDelete(tradeId)
    setShowConfirmDeleteModal(true)
  }

  const confirmDeleteTradeLog = async () => {
    setShowConfirmDeleteModal(false)
    if (!tradeIdToDelete || !db || !userId || !isAuthReady) {
      setCurrentAlert({ message: "Trade log deletion service not ready.", type: "warning" })
      return
    }
    setTradeLogError(null)
    try {
      const tradeDocRef = doc(db, `artifacts/${appId}/users/${userId}/tradeLogs`, tradeIdToDelete)
      await deleteDoc(tradeDocRef)
      setCurrentAlert({ message: "Trade log deleted!", type: "success" })
      setTradeIdToDelete(null)
    } catch (error: any) {
      console.error("DIAG: Error deleting trade log:", error)
      setTradeLogError(error.message || "Failed to delete trade log.")
      setCurrentAlert({ message: `Failed to delete trade log: ${error.message}`, type: "error" })
    }
  }

  const cancelDeleteTradeLog = () => {
    setShowConfirmDeleteModal(false)
    setTradeIdToDelete(null)
  }

  const handleChatInputKeyDown = useCallback(async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isSendingMessage && messageInput.trim()) {
        if (!currentChatSessionId) {
          const newSessionId = await handleNewConversation()
          if (newSessionId) await handleSendMessage()
        } else {
          await handleSendMessage()
        }
      }
    }
  }, [messageInput, isSendingMessage, currentChatSessionId, handleSendMessage, handleNewConversation])

  useEffect(() => {
    if (!isAuthReady) return
    if (db && userId) {
      const sessionsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/chatSessions`)
      const q = query(sessionsCollectionRef, orderBy('createdAt', 'desc'))
      const unsubscribe = onSnapshot(q, snapshot => {
        const sessions = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || "Untitled Chat",
          createdAt: doc.data().createdAt,
          lastMessageText: doc.data().lastMessageText || "No messages yet.",
          lastMessageTimestamp: doc.data().lastMessageTimestamp || null
        })) as ChatSession[]
        setChatSessions(sessions)
        if (!currentChatSessionId || !sessions.some(s => s.id === currentChatSessionId)) {
          setCurrentChatSessionId(sessions.length > 0 ? sessions[0].id : null)
        }
      }, error => {
        console.error("DIAG: Error fetching chat sessions:", error)
        setCurrentAlert({ message: `Failed to load chat sessions: ${error.message}`, type: "error" })
      })
      return () => unsubscribe()
    } else {
      setChatSessions([])
    }
  }, [db, userId, isAuthReady, currentChatSessionId, appId])

  useEffect(() => {
    if (!isAuthReady || !db || !userId || !currentChatSessionId) {
      setChatMessages([])
      return
    }
    const messagesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`)
    const q = query(messagesCollectionRef, orderBy('timestamp', 'asc'))
    const unsubscribe = onSnapshot(q, snapshot => {
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        sender: doc.data().sender,
        text: doc.data().text,
        timestamp: doc.data().timestamp,
        type: doc.data().type || 'text',
        audioUrl: doc.data().audioUrl || undefined,
        analysis: doc.data().analysis || undefined,
      })) as ChatMessage[]
      setChatMessages(messages)
    }, error => {
      console.error("DIAG: Error fetching messages:", error)
      setCurrentAlert({ message: `Failed to load messages: ${error.message}`, type: "error" })
    })
    return () => unsubscribe()
  }, [db, userId, currentChatSessionId, isAuthReady, appId])

  useEffect(() => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [chatMessages, activeView, isChatHistoryMobileOpen])

  const fetchMarketPricesData = useCallback(async (initialLoad = false) => {
    try {
      if (initialLoad) setLoadingPrices(true)
      setErrorPrices(null)
      const response = await fetchWithRetry(`${BACKEND_BASE_URL}/all_market_prices`, {})
      const data: AllMarketPrices = await response.json()
      setMarketPrices(data)
    } catch (error: any) {
      console.error("DIAG: Error fetching market prices:", error)
      setErrorPrices("Failed to fetch market prices. Using mock data.")
      setMarketPrices({
        BTCUSDT: { price: 50000, percent_change: 1.5, rsi: 70, macd: 200, stoch_k: 80, volume: 1000, orscr_signal: "BUY" },
        ETHUSDT: { price: 3000, percent_change: -0.5, rsi: 50, macd: -100, stoch_k: 60, volume: 500, orscr_signal: "SELL" },
      })
    } finally {
      if (initialLoad) setLoadingPrices(false)
    }
  }, [BACKEND_BASE_URL])

  useEffect(() => {
    fetchMarketPricesData(true)
    const intervalId = setInterval(() => fetchMarketPricesData(false), 10000)
    return () => clearInterval(intervalId)
  }, [fetchMarketPricesData])

  const fetchAnalysisLivePrice = useCallback(async (pair: string) => {
    try {
      const backendSymbol = pair.replace('/', '') + 'T'
      const response = await fetchWithRetry(`${BACKEND_BASE_URL}/all_market_prices`, {})
      const data: AllMarketPrices = await response.json()
      if (data[backendSymbol] && typeof data[backendSymbol].price === 'number') {
        setCurrentLivePrice(data[backendSymbol].price.toLocaleString())
      } else {
        setCurrentLivePrice('N/A')
      }
    } catch (e: any) {
      console.error("DIAG: Error fetching live price:", e)
      setCurrentLivePrice('Error')
    }
  }, [BACKEND_BASE_URL])

  useEffect(() => {
    if (activeView === 'analysis') {
      fetchAnalysisLivePrice(analysisCurrencyPair)
      const intervalId = setInterval(() => fetchAnalysisLivePrice(analysisCurrencyPair), 10000)
      return () => clearInterval(intervalId)
    }
  }, [activeView, analysisCurrencyPair, fetchAnalysisLivePrice])

  useEffect(() => {
    if (!isAuthReady || !db || !userId) {
      setTradeLogs([])
      setLoadingTradeLogs(false)
      return
    }
    setLoadingTradeLogs(true)
    const tradeLogsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/tradeLogs`)
    const q = query(tradeLogsCollectionRef, orderBy('timestamp', 'desc'))
    const unsubscribe = onSnapshot(q, snapshot => {
      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        currencyPair: doc.data().currencyPair,
        entryPrice: doc.data().entryPrice,
        exitPrice: doc.data().exitPrice,
        volume: doc.data().volume,
        profitOrLoss: doc.data().profitOrLoss,
        timestamp: doc.data().timestamp,
        journalEntry: doc.data().journalEntry || '',
      })) as TradeLogEntry[]
      setTradeLogs(logs)
      setLoadingTradeLogs(false)
    }, error => {
      console.error("DIAG: Error fetching trade logs:", error)
      setTradeLogError(error.message || "Failed to load trade logs.")
      setCurrentAlert({ message: `Failed to load trade logs: ${error.message}`, type: "error" })
      setLoadingTradeLogs(false)
    })
    return () => unsubscribe()
  }, [db, userId, isAuthReady, appId])

  if (!isAuthReady) {
    return <div className="flex h-screen items-center justify-center bg-[#0A0F2A] text-gray-200">Authenticating...</div>
  }

  return (
    <div className="flex h-screen bg-[#0A0F2A] text-gray-200 font-sans">
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[#0A0F2A]/90 backdrop-blur-sm transition-transform md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between px-6 border-b border-purple-500/20">
          <div className="flex items-center space-x-2">
            <Bot className="h-6 w-6 text-purple-400" />
            <span className="text-xl font-semibold">Aura Bot</span>
          </div>
          <button className="md:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-6 w-6 text-gray-400" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 px-4 py-4">
          {['dashboard', 'chat', 'analysis', 'trade-log', 'settings'].map(view => (
            <a
              key={view}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                activeView === view
                  ? "bg-gradient-to-r from-purple-600/50 to-blue-600/50 text-white"
                  : "text-gray-400 hover:bg-gray-800/50 hover:text-white"
              }`}
              href="#"
              onClick={() => { setActiveView(view); setSidebarOpen(false) }}
            >
              {view === 'dashboard' && <Home className="h-5 w-5" />}
              {view === 'chat' && <MessageCircle className="h-5 w-5" />}
              {view === 'analysis' && <BarChart3 className="h-5 w-5" />}
              {view === 'trade-log' && <FileText className="h-5 w-5" />}
              {view === 'settings' && <Settings className="h-5 w-5" />}
              {view.charAt(0).toUpperCase() + view.slice(1).replace('-', ' ')}
            </a>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col md:pl-64">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between bg-[#0A0F2A]/90 backdrop-blur-sm px-6 border-b border-purple-500/20">
          <button className="md:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-6 w-6 text-gray-400" />
          </button>
          <h1 className="text-xl font-semibold">Aura Trading Dashboard</h1>
          <div className="ml-auto flex items-center space-x-4">
            <Bell className="h-6 w-6 text-gray-400" />
            <span className="text-sm text-gray-400">User ID: {userId ? `${userId.substring(0, 8)}...` : 'Loading...'}</span>
            <User className="h-6 w-6 text-gray-400" />
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          <main className="flex-1 p-6">
            {currentAlert && <CustomAlert message={currentAlert.message} type={currentAlert.type} onClose={() => setCurrentAlert(null)} />}
            {showConfirmDeleteModal && (
              <CustomConfirmModal
                message="Are you sure you want to delete this trade log?"
                onConfirm={confirmDeleteTradeLog}
                onCancel={cancelDeleteTradeLog}
              />
            )}

            {activeView === "dashboard" && (
              <div className="flex flex-col space-y-6">
                <h2 className="text-2xl font-bold text-white">Market Overview</h2>
                {loadingPrices && <p className="text-gray-400">Loading market prices...</p>}
                {errorPrices && <p className="text-red-400">Error: {errorPrices}</p>}
                {!loadingPrices && !errorPrices && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Object.entries(marketPrices).map(([pair, data]) => (
                      <div key={pair} className="bg-gray-800/20 rounded-lg p-4 shadow-lg border border-purple-500/10 backdrop-blur-sm">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-lg font-semibold text-gray-200">{pair}</h3>
                          {typeof data.percent_change === 'number' && data.percent_change >= 0 ? (
                            <TrendingUp className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <TrendingDown className="w-5 h-5 text-red-400" />
                          )}
                        </div>
                        <div className="text-3xl font-bold text-white">${typeof data.price === 'number' ? data.price.toFixed(2) : 'N/A'}</div>
                        <div className={`text-sm ${typeof data.percent_change === 'number' && data.percent_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {typeof data.percent_change === 'number' ? data.percent_change.toFixed(2) : 'N/A'}%
                          <span className="text-gray-400 ml-1">Today</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-2">
                          RSI: {typeof data.rsi === 'number' ? data.rsi.toFixed(2) : "N/A"} | MACD: {typeof data.macd === 'number' ? data.macd.toFixed(2) : "N/A"}
                        </div>
                        <div className={`text-sm font-semibold mt-1 ${
                          data.orscr_signal === "BUY" ? 'text-emerald-400' : data.orscr_signal === "SELL" ? 'text-red-400' : 'text-amber-400'
                        }`}>
                          Signal: {data.orscr_signal || 'N/A'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-800/20 rounded-lg p-6 shadow-lg border border-purple-500/10 backdrop-blur-sm">
                    <h3 className="text-xl font-semibold text-white mb-4">Trading Performance</h3>
                    {loadingTradeLogs ? (
                      <p className="text-gray-400">Loading performance data...</p>
                    ) : tradeLogs.length === 0 ? (
                      <p className="text-gray-400">No trades logged yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="text-center p-3 bg-gray-700/20 rounded-lg">
                          <div className="text-sm text-gray-400">Total Trades</div>
                          <div className="text-lg font-bold text-white">{tradeLogs.length}</div>
                        </div>
                        <div className="text-center p-3 bg-gray-700/20 rounded-lg">
                          <div className="text-sm text-gray-400">Total P/L</div>
                          <div className={`text-lg font-bold ${tradeLogs.reduce((sum, trade) => sum + trade.profitOrLoss, 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            ${tradeLogs.reduce((sum, trade) => sum + trade.profitOrLoss, 0).toFixed(2)}
                          </div>
                        </div>
                        <div className="text-center p-3 bg-gray-700/20 rounded-lg">
                          <div className="text-sm text-gray-400">Win Rate</div>
                          <div className="text-lg font-bold text-white">
                            {((tradeLogs.filter(t => t.profitOrLoss > 0).length / tradeLogs.length) * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-gray-800/20 rounded-lg p-6 shadow-lg border border-purple-500/10 backdrop-blur-sm">
                    <h3 className="text-xl font-semibold text-white mb-4">Recent Alerts</h3>
                    {currentAlert ? (
                      <div className="space-y-2">
                        <div className={`p-3 rounded-lg ${currentAlert.type === 'success' ? 'bg-emerald-600/20' : currentAlert.type === 'error' ? 'bg-red-600/20' : 'bg-blue-600/20'}`}>
                          <p className="text-sm text-gray-200">{currentAlert.message}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-400">No recent alerts.</p>
                    )}
                  </div>
                </div>

                <div className="bg-gray-800/20 rounded-lg p-6 shadow-lg border border-purple-500/10 backdrop-blur-sm">
                  <h3 className="text-xl font-semibold text-white mb-4">Market Selection</h3>
                  <select
                    className="w-full bg-gray-800/50 border border-gray-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    onChange={(e) => {
                      const selectedPair = e.target.value
                      setMarketPrices(prev => {
                        if (!selectedPair) return prev
                        const filtered = Object.keys(prev)
                          .filter(key => key.includes(selectedPair.replace('/', '')))
                          .reduce((obj, key) => ({ ...obj, [key]: prev[key] }), {})
                        return filtered
                      })
                    }}
                  >
                    <option value="">All Markets</option>
                    <option>BTC/USD</option>
                    <option>ETH/USD</option>
                    <option>ADA/USD</option>
                    <option>SOL/USD</option>
                  </select>
                </div>
              </div>
            )}

            {activeView === "chat" && (
              <div className="flex flex-col md:flex-row h-full bg-gray-800/10 rounded-lg shadow-xl overflow-hidden border border-purple-500/10 backdrop-blur-sm">
                <div className="flex items-center justify-between p-4 border-b border-purple-500/20">
                  <button
                    className="md:hidden text-gray-400 hover:text-white"
                    onClick={() => {
                      if (currentChatSessionId) {
                        setCurrentChatSessionId(null)
                        setChatMessages([])
                      }
                    }}
                  >
                    {currentChatSessionId ? <X className="h-6 w-6" /> : null}
                  </button>
                  <div className="flex-1 text-center font-semibold text-lg text-gray-200">
                    Aura Bot {userId ? `${userId.substring(0, 8)}...` : ''}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={handleNewConversation}
                      className="p-2 rounded-full bg-purple-600/80 hover:bg-purple-700/80 text-white transition-all duration-200"
                      title="New Chat"
                    >
                      <SquarePen className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => setIsChatHistoryMobileOpen(true)}
                      className="p-2 rounded-full bg-gray-700/50 hover:bg-gray-600/50 text-gray-200 transition-all duration-200"
                      title="View History"
                    >
                      <History className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {currentChatSessionId ? (
                  <div className="flex-1 flex flex-col relative overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar" style={{ paddingBottom: '88px' }}>
                      <div className="space-y-4">
                        {chatMessages.map(msg => (
                          <div key={msg.id} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                            <div
                              className={`max-w-[80%] p-3 rounded-xl ${
                                msg.sender === "user"
                                  ? "bg-gradient-to-r from-purple-600/80 to-blue-600/80 text-white"
                                  : "bg-gray-700/30 text-gray-200 backdrop-blur-sm"
                              }`}
                            >
                              {msg.type === 'audio' && msg.audioUrl ? (
                                <div>
                                  <audio controls src={msg.audioUrl} className="mt-2 max-w-full" />
                                  <p className="text-xs text-gray-400 mt-1">{msg.text}</p>
                                </div>
                              ) : msg.type === 'analysis' && msg.analysis ? (
                                <div>
                                  <p className="font-semibold">{msg.text}</p>
                                  <div className="mt-2 p-3 bg-gray-800/20 rounded-lg border border-purple-500/10">
                                    <p><strong>Symbol:</strong> {msg.analysis.symbol}</p>
                                    <p><strong>Confidence:</strong> {msg.analysis.confidence_score}</p>
                                    <p><strong>Signal:</strong> {msg.analysis.ai_suggestion.signal}</p>
                                    <p><strong>Action:</strong> {msg.analysis.ai_suggestion.recommended_action}</p>
                                  </div>
                                </div>
                              ) : (
                                <div className="prose prose-invert prose-p:my-1 prose-li:my-1 prose-li:leading-tight prose-ul:my-1 text-sm leading-relaxed">
                                  <ReactMarkdown rehypePlugins={[rehypeRaw]}>{msg.text}</ReactMarkdown>
                                </div>
                              )}
                              {msg.timestamp && typeof msg.timestamp.toDate === 'function' && (
                                <p className="text-xs text-gray-400 mt-1 text-right">
                                  {msg.timestamp.toDate().toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div ref={chatMessagesEndRef} />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-[#0A0F2A]/90 border-t border-purple-500/20 z-10">
                      <div className="relative flex items-center w-full bg-gray-800/30 rounded-lg border border-purple-500/10 pr-2">
                        <textarea
                          placeholder="Ask anything (Shift + Enter for new line)"
                          className="flex-1 bg-transparent text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y min-h-[40px] max-h-[120px] custom-scrollbar"
                          value={messageInput}
                          onChange={e => setMessageInput(e.target.value)}
                          onKeyDown={handleChatInputKeyDown}
                          rows={Math.min(5, (messageInput.split('\n').length || 1))}
                          disabled={isSendingMessage}
                        />
                        <button
                          className="p-2 text-white rounded-full bg-purple-600/80 hover:bg-purple-700/80 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 transition-all duration-200"
                          onClick={() => handleSendMessage(false)}
                          disabled={isSendingMessage || !messageInput.trim()}
                        >
                          {isSendingMessage ? (
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <Send className="h-5 w-5" />
                          )}
                        </button>
                        <button
                          onClick={async () => {
                            if (isVoiceRecording) {
                              handleStopVoiceRecording()
                            } else {
                              await handleStartVoiceRecording()
                            }
                          }}
                          className={`ml-2 p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500 ${isVoiceRecording ? 'bg-red-600/80 hover:bg-red-700/80' : 'bg-blue-600/80 hover:bg-blue-700/80'}`}
                          title={isVoiceRecording ? "Stop Recording" : "Start Voice Recording"}
                          disabled={isSendingMessage || !currentChatSessionId}
                        >
                          {isVoiceRecording ? <Volume2 className="h-5 w-5 text-white animate-pulse" /> : <Mic className="h-5 w-5 text-white" />}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-4 pb-20">
                    <Bot className="h-24 w-24 text-purple-400 mb-4 animate-pulse" />
                    <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-8">Aura AI</h2>
                    <p className="text-xl text-gray-400 mb-12">Your intelligent trading assistant.</p>
                    <div className="relative w-full max-w-xl mb-4">
                      <div className="relative flex items-center w-full bg-gray-800/30 rounded-lg border border-purple-500/10 pr-2">
                        <textarea
                          placeholder="Ask anything (Shift + Enter for new line)"
                          className="flex-1 bg-transparent text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y min-h-[40px] max-h-[120px] custom-scrollbar"
                          value={messageInput}
                          onChange={e => setMessageInput(e.target.value)}
                          onKeyDown={handleChatInputKeyDown}
                          rows={Math.min(5, (messageInput.split('\n').length || 1))}
                          disabled={isSendingMessage}
                        />
                        <button
                          className="p-2 text-white rounded-full bg-purple-600/80 hover:bg-purple-700/80 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 transition-all duration-200"
                          onClick={async () => {
                            if (messageInput.trim()) {
                              if (!currentChatSessionId) {
                                const newSessionId = await handleNewConversation()
                                if (!newSessionId) return
                              }
                              await handleSendMessage()
                            }
                          }}
                          disabled={isSendingMessage || !messageInput.trim()}
                        >
                          {isSendingMessage ? (
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <Send className="h-5 w-5" />
                          )}
                        </button>
                        <button
                          onClick={async () => {
                            if (!currentChatSessionId) {
                              const newSessionId = await handleNewConversation()
                              if (!newSessionId) return
                            }
                            if (isVoiceRecording) {
                              handleStopVoiceRecording()
                            } else {
                              await handleStartVoiceRecording()
                            }
                          }}
                          className={`ml-2 p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500 ${isVoiceRecording ? 'bg-red-600/80 hover:bg-red-700/80' : 'bg-blue-600/80 hover:bg-blue-700/80'}`}
                          title={isVoiceRecording ? "Stop Recording" : "Start Voice Recording"}
                          disabled={isSendingMessage}
                        >
                          {isVoiceRecording ? <Volume2 className="h-5 w-5 text-white animate-pulse" /> : <Mic className="h-5 w-5 text-white" />}
                        </button>
                      </div>
                    </div>
                    <div className="flex space-x-4 mt-4">
                      <button className="bg-gray-700/50 text-gray-300 px-6 py-2 rounded-full hover:bg-gray-600/50 transition-colors">
                        Create Images
                      </button>
                      <button className="bg-gray-700/50 text-gray-300 px-6 py-2 rounded-full hover:bg-gray-600/50 transition-colors">
                        Edit Image
                      </button>
                    </div>
                  </div>
                )}

                <div
                  className={`fixed inset-y-0 right-0 z-50 w-full md:w-80 flex-col bg-[#0A0F2A]/90 border-l border-purple-500/20 backdrop-blur-sm transition-transform ease-out duration-300 ${
                    isChatHistoryMobileOpen ? "translate-x-0" : "translate-x-full"
                  } flex`}
                >
                  <div className="flex items-center justify-between p-4 border-b border-purple-500/20">
                    <h3 className="text-xl font-extrabold text-purple-400">History</h3>
                    <button onClick={() => setIsChatHistoryMobileOpen(false)} className="text-gray-400 hover:text-white">
                      <X className="h-6 w-6" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                    {chatSessions.length > 0 ? (
                      chatSessions.map(session => (
                        <div
                          key={session.id}
                          onClick={() => handleSwitchConversation(session.id)}
                          className={`p-3 rounded-lg cursor-pointer transition duration-150 ease-in-out ${
                            session.id === currentChatSessionId ? 'bg-gradient-to-r from-purple-600/50 to-blue-600/50 text-white' : 'bg-gray-700/30 text-gray-200 hover:bg-gray-600/30'
                          }`}
                        >
                          <p className="font-semibold text-lg truncate">{session.name || 'Untitled Chat'}</p>
                          <p className="text-sm text-gray-400 truncate mt-1">{session.lastMessageText || 'No messages yet...'}</p>
                          {session.createdAt && typeof session.createdAt.toDate === 'function' && (
                            <p className="text-xs text-gray-500 mt-1">{session.createdAt.toDate().toLocaleDateString()}</p>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-md text-center mt-4">No conversations yet.</p>
                    )}
                  </div>
                  <div className="p-4 border-t border-purple-500/20">
                    <button
                      onClick={handleNewConversation}
                      className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:from-purple-700 hover:to-blue-700 transition duration-200 ease-in-out transform hover:scale-105"
                    >
                      <Plus className="inline-block w-5 h-5 mr-2" /> Start New Chat
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeView === "analysis" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                  <div className="bg-gray-800/20 rounded-xl shadow-lg border border-purple-500/10 backdrop-blur-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-purple-300">Market Selection</h3>
                      <BarChart3 className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Currency Pair</label>
                        <select
                          className="w-full bg-gray-800/30 border border-gray-600/50 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          value={analysisCurrencyPair}
                          onChange={e => setAnalysisCurrencyPair(e.target.value)}
                        >
                          <option>BTC/USD</option>
                          <option>ETH/USD</option>
                          <option>ADA/USD</option>
                          <option>SOL/USD</option>
                          <option>DOGE/USD</option>
                          <option>XRP/USD</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Timeframe</label>
                        <div className="grid grid-cols-3 gap-2">
                          {availableTimeframes.map(tf => (
                            <button
                              key={tf}
                              onClick={() => handleTimeframeButtonClick(tf)}
                              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                analysisTimeframes.includes(tf)
                                  ? 'bg-gradient-to-r from-purple-600/80 to-blue-600/80 text-white'
                                  : 'bg-gray-800/30 border border-gray-600/50 text-gray-300 hover:bg-gray-700/30'
                              }`}
                            >
                              {tf}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Trade Type</label>
                        <select
                          className="w-full bg-gray-800/30 border border-gray-600/50 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          value={analysisTradeType}
                          onChange={e => setAnalysisTradeType(e.target.value)}
                        >
                          <option>Scalp (Quick trades)</option>
                          <option>Day Trade (Intraday)</option>
                          <option>Long Hold (Position)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-800/20 rounded-xl shadow-lg border border-blue-500/10 backdrop-blur-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-blue-300">Technical Indicators</h3>
                      <TrendingUp className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="space-y-3">
                      {availableIndicators.map(indicator => (
                        <div key={indicator.name} className="flex items-center justify-between p-2 hover:bg-gray-700/20 rounded">
                          <div>
                            <div className="font-medium text-sm">{indicator.name}</div>
                            <div className="text-xs text-gray-400">{indicator.desc}</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={analysisIndicators.includes(indicator.name)}
                            onChange={() => handleIndicatorChange(indicator.name)}
                            className="w-4 h-4 text-purple-600 bg-gray-700/30 border-gray-600/50 rounded focus:ring-purple-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-gray-800/20 rounded-xl shadow-lg border border-emerald-500/10 backdrop-blur-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-emerald-300">Trading Parameters</h3>
                      <DollarSign className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Available Balance</label>
                        <input
                          type="number"
                          step="0.01"
                          className="w-full bg-gray-800/30 border border-gray-600/50 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          placeholder="10000.00"
                          value={analysisBalance}
                          onChange={e => setAnalysisBalance(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Leverage</label>
                        <select
                          className="w-full bg-gray-800/30 border border-gray-600/50 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          value={analysisLeverage}
                          onChange={e => setAnalysisLeverage(e.target.value)}
                        >
                          <option>1x (No Leverage)</option>
                          <option>1x5 (5x Leverage)</option>
                          <option>1x10 (10x Leverage)</option>
                          <option>1x25 (25x Leverage)</option>
                          <option>1x50 (50x Leverage)</option>
                          <option>1x100 (100x Leverage)</option>
                          <option>1x200 (200x Leverage)</option>
                        </select>
                      </div>
                      <button
                        onClick={handleRunAnalysis}
                        disabled={isAnalyzing}
                        className="w-full inline-flex items-center justify-center px-5 py-3 rounded-lg font-semibold bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 transition-all duration-200 disabled:opacity-50"
                      >
                        {isAnalyzing ? (
                          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <Play className="w-4 h-4 mr-2" />
                        )}
                        {isAnalyzing ? "Analyzing..." : "Run AI Analysis"}
                      </button>
                      {analysisError && <p className="text-red-400 text-sm mt-2">{analysisError}</p>}
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-gray-800/20 rounded-xl shadow-lg border border-cyan-500/10 backdrop-blur-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-cyan-300">Live Market Data</h3>
                      <div className="flex items-center text-emerald-400">
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse mr-2"></div>
                        <span className="text-sm">Connected</span>
                      </div>
                    </div>
                    {loadingPrices && <p className="text-gray-400">Loading live market data...</p>}
                    {errorPrices && <p className="text-red-400">Error loading live data.</p>}
                    {!loadingPrices && !errorPrices && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-3 bg-gray-700/20 rounded-lg">
                          <div className="text-sm text-gray-400">Current Price</div>
                          <div className="text-lg font-bold text