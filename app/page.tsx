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
  doc
} from 'firebase/firestore'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'

const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || "http://127.0.0.1:10000"
console.log("DIAG: Initial BACKEND_BASE_URL (from env or fallback):", BACKEND_BASE_URL)
const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id'
console.log("DIAG: Initial appId (from environment or fallback):", appId)

// Define interfaces for the expected API response structure
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

// Market Data (for Dashboard and Analysis Live Price)
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

// Interface for a chat session
interface ChatSession {
  id: string
  name: string
  createdAt: any
  lastMessageText: string
  lastMessageTimestamp?: any
}

// Interfaces for Trade Log
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

// Chat message interface updated to include 'type' and 'audioUrl' and 'analysis'
interface ChatMessage {
  id: string
  sender: 'user' | 'ai'
  text: string
  timestamp?: any
  type?: 'text' | 'audio' | 'analysis'
  audioUrl?: string
  analysis?: AnalysisResult
}

// Custom Alert/Message component
const CustomAlert: React.FC<{ message: string; type: 'success' | 'error' | 'warning' | 'info'; onClose: () => void }> = ({ message, type, onClose }) => {
  const bgColor = {
    'success': 'bg-emerald-600/80',
    'error': 'bg-red-600/80',
    'warning': 'bg-amber-600/80',
    'info': 'bg-blue-600/80'
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

// Custom Confirmation Modal component
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

// !!! THIS IS THE MAIN EXPORT FOR YOUR PAGE !!!
export default function TradingDashboardWrapper() {
  return (
    <FirebaseProvider>
      <TradingDashboardContent />
    </FirebaseProvider>
  )
}

function TradingDashboardContent() {
  // Use Firebase hook to get database, user ID, and readiness states
  const { db, userId, isAuthReady } = useFirebase()

  // --- STATE VARIABLES ---
  const [activeView, setActiveView] = useState("dashboard")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentAlert, setCurrentAlert] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null)
  const [isChatHistoryMobileOpen, setIsChatHistoryMobileOpen] = useState(false)

  // Market Data states
  const [marketPrices, setMarketPrices] = useState<AllMarketPrices>({})
  const [loadingPrices, setLoadingPrices] = useState(true)
  const [errorPrices, setErrorPrices] = useState<string | null>(null)
  const [currentLivePrice, setCurrentLivePrice] = useState<string>('N/A')

  // Chat states
  const [messageInput, setMessageInput] = useState("")
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const chatMessagesEndRef = useRef<HTMLDivElement>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [currentChatSessionId, setCurrentChatSessionId] = useState<string | null>(null)
  const [isVoiceRecording, setIsVoiceRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null) // Corrected initialization
  const audioChunksRef = useRef<Blob[]>([])

  const [aiAssistantName] = useState("Aura")

  // Analysis Page Inputs and Results
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

  // Trade Log states
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

  // Confirmation Modal states
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false)
  const [tradeIdToDelete, setTradeIdToDelete] = useState<string | null>(null)

  // Settings states (backendUrlSetting is already derived from BACKEND_BASE_URL at the top)
  const [backendUrlSetting] = useState(BACKEND_BASE_URL)

  // --- HANDLERS ---

  const fetchWithRetry = async (url: string, options: RequestInit, retries = 3): Promise<Response> => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options)
        if (response.ok) return response
        throw new Error(`HTTP error! Status: ${response.status}`)
      } catch (error: any) {
        if (i === retries - 1) {
          console.error(`DIAG: fetchWithRetry failed after ${retries} attempts for URL: ${url}`, error)
          throw error // Rethrow the error if all retries fail
        }
        console.warn(`DIAG: fetchWithRetry attempt ${i + 1} failed for URL: ${url}. Retrying...`, error)
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))) // Exponential backoff
      }
    }
    // This line should technically be unreachable if the last throw error is hit.
    throw new Error("Max retries reached for fetchWithRetry")
  }


  const handleNewConversation = useCallback(async () => {
    console.log("DIAG: handleNewConversation called. Firebase ready state: db:", !!db, "userId:", !!userId, "isAuthReady:", isAuthReady)
    if (!db || !userId || !isAuthReady) {
      setCurrentAlert({ message: "Chat service not ready. Please wait a moment for authentication to complete.", type: "warning" })
      console.warn("DIAG: Attempted to create new conversation, but Firebase not ready.")
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
      setCurrentAlert({ message: "New conversation started! Type your first message.", type: "success" })
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
      console.log("DIAG: Initial greeting added to new chat session.")
      return newSessionRef.id
    } catch (error: any) {
      console.error("DIAG: Error creating new conversation:", error)
      setCurrentAlert({ message: `Failed to start new conversation: ${error.message}`, type: "error" })
      return null
    }
  }, [db, userId, isAuthReady, setChatMessages, setMessageInput, setIsChatHistoryMobileOpen, setCurrentAlert, aiAssistantName, appId])


  const handleSwitchConversation = (sessionId: string) => {
    setCurrentChatSessionId(sessionId)
    setIsChatHistoryMobileOpen(false)
    setMessageInput('')
    setCurrentAlert({ message: "Switched to selected conversation.", type: "info" })
    console.log("DIAG: Switched to conversation ID:", sessionId)
  }


  const handleORMCRAnalysisRequest = useCallback(async (symbol: string) => {
    console.log(`DIAG: Requesting ORMCR analysis for ${symbol}.`)
    const analysisPendingMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sender: 'ai',
      type: 'text',
      text: `Please wait while I retrieve ORMCR analysis for ${symbol}... This might take a moment.`,
      timestamp: db ? serverTimestamp() : null,
    }
    if (db && userId && currentChatSessionId && isAuthReady) {
      await addDoc(collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`), analysisPendingMessage)
    } else {
      setChatMessages((prevMessages) => [...prevMessages, analysisPendingMessage])
    }

    try {
      const response = await fetchWithRetry(`${BACKEND_BASE_URL}/run_ormcr_analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol: symbol, userId: userId }),
      })

      const analysisResult: AnalysisResult = await response.json()
      console.log("DIAG: ORMCR Analysis Result:", analysisResult)

      // Delete the pending message regardless of success or failure
      if (db && userId && currentChatSessionId && isAuthReady) {
        const messagesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`)
        const q = query(messagesCollectionRef, where('id', '==', analysisPendingMessage.id))
        const querySnapshot = await getDocs(q)
        querySnapshot.forEach(async (docRef) => await deleteDoc(docRef.ref))
      } else {
        setChatMessages((prevMessages) => prevMessages.filter(msg => msg.id !== analysisPendingMessage.id))
      }

      const aiAnalysisMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sender: 'ai',
        type: 'analysis',
        text: `Here is the ORMCR analysis for ${symbol}:`,
        timestamp: db ? serverTimestamp() : null,
        analysis: analysisResult,
      }

      if (db && userId && currentChatSessionId && isAuthReady) {
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`), aiAnalysisMessage)
        console.log("DIAG: AI analysis message added to Firestore.")
      } else {
        setChatMessages((prevMessages) => [...prevMessages, aiAnalysisMessage])
      }

      setCurrentAlert({ message: "ORMCR Analysis completed and added to chat.", type: "success" })

    } catch (error: any) {
      console.error("DIAG: Error requesting ORMCR analysis:", error)
      // Ensure pending message is removed on error
      if (db && userId && currentChatSessionId && isAuthReady) {
        const messagesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`)
        const q = query(messagesCollectionRef, where('id', '==', analysisPendingMessage.id))
        const querySnapshot = await getDocs(q)
        querySnapshot.forEach(async (docRef) => await deleteDoc(docRef.ref))
      } else {
        setChatMessages((prevMessages) => prevMessages.filter(msg => msg.id !== analysisPendingMessage.id))
      }

      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sender: 'ai',
        type: 'text',
        text: `Error requesting ORMCR analysis for ${symbol}. Details: ${error.message || "Unknown error"}.`,
        timestamp: db ? serverTimestamp() : null,
      }
      if (db && userId && currentChatSessionId && isAuthReady) {
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`), errorMessage)
      } else {
        setChatMessages((prevMessages) => [...prevMessages, errorMessage])
      }
      setCurrentAlert({ message: `Analysis failed: ${error.message || "Unknown error"}. Check backend deployment.`, type: "error" })
    }
  }, [db, userId, currentChatSessionId, isAuthReady, setChatMessages, setCurrentAlert, appId, BACKEND_BASE_URL, fetchWithRetry])


  const fetchBackendChatResponse = useCallback(async (requestBody: any) => {
    console.log("DIAG: Fetching AI chat response.")
    try {
      const response = await fetchWithRetry(`${BACKEND_BASE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      })

      const data = await response.json()
      const aiResponseText = data.response || "No response from AI."
      console.log("DIAG: AI raw response:", data)

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
          console.log("DIAG: AI response added to Firestore.")

          const sessionDocRef = doc(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}`)
          await setDoc(sessionDocRef, {
            lastMessageText: aiMessage.text,
            lastMessageTimestamp: aiMessage.timestamp,
          }, { merge: true })
        } else {
          setChatMessages((prevMessages) => [...prevMessages, aiMessage])
        }
      }
    } catch (error: any) {
      console.error("DIAG: Error communicating with backend:", error)
      setCurrentAlert({ message: `Failed to get AI response. Check backend deployment and URL: ${error.message || "Unknown error"}.`, type: "error" })
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sender: "ai",
        text: `Oops! I encountered an error getting a response from the backend: ${error.message || "Unknown error"}. Please check your backend's status and its URL configuration in Vercel. 😅`,
        timestamp: db ? serverTimestamp() : null,
        type: 'text'
      }
      if (db && userId && currentChatSessionId && isAuthReady) {
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`), errorMessage)
      } else {
        setChatMessages((prevMessages) => [...prevMessages, errorMessage])
      }
    } finally {
      setIsSendingMessage(false)
      console.log("DIAG: Backend fetch finished.")
    }
  }, [db, userId, currentChatSessionId, isAuthReady, setChatMessages, setCurrentAlert, handleORMCRAnalysisRequest, appId, BACKEND_BASE_URL, fetchWithRetry])


  const handleSendMessage = useCallback(async (isVoice = false, audioBlob?: Blob) => {
    console.log("DIAG: handleSendMessage called. isVoice:", isVoice, "audioBlob:", !!audioBlob)
    if (!messageInput.trim() && !isVoice) {
      console.log("DIAG: handleSendMessage aborted: message is empty or only whitespace, and not a voice message.")
      return
    }
    if (!db || !userId || !currentChatSessionId || !isAuthReady) {
      setCurrentAlert({ message: "Chat service not ready. Please wait a moment for authentication to complete.", type: "warning" })
      console.warn("DIAG: Attempted to send message, but Firebase not ready. State: db:", !!db, "userId:", !!userId, "isAuthReady:", isAuthReady)
      return
    }

    const messageContent = messageInput.trim()
    const messageType = isVoice ? 'audio' : 'text'

    setIsSendingMessage(true)
    setMessageInput("")

    try {
      // Conditionally add audioUrl only if it's a voice message AND audioBlob exists
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sender: "user",
        text: messageContent,
        timestamp: serverTimestamp(),
        type: messageType,
      }

      if (isVoice && audioBlob) {
        const storage = getStorage()
        // Ensure path is correct, e.g., artifacts/{appId}/users/{userId}/audio/{messageId}.webm
        const audioRef = ref(storage, `artifacts/${appId}/users/${userId}/audio/${userMessage.id}.webm`)
        await uploadBytes(audioRef, audioBlob)
        userMessage.audioUrl = await getDownloadURL(audioRef)
        console.log("DIAG: Audio uploaded to Storage:", userMessage.audioUrl)
      }
      console.log("DIAG: User message prepared:", userMessage)

      console.log("DIAG: Adding user message to Firestore for session:", currentChatSessionId)
      await addDoc(collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`), userMessage)
      console.log("DIAG: User message added to Firestore.")

      const sessionDocRef = doc(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}`)

      const isFirstMessageInNewSession = chatMessages.length === 1 && chatMessages[0].sender === 'ai'
      const currentSession = chatSessions.find((s: ChatSession) => s.id === currentChatSessionId)
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
      console.log("DIAG: Chat session updated with last message and name:", newSessionName)

      // Prepare chat history for backend
      const payloadHistory = chatMessages
        .filter(msg => msg.id !== 'initial-greeting') // Filter out the initial AI greeting
        .map(msg => ({ role: msg.sender === "user" ? "user" : "model", text: msg.text }))
      payloadHistory.push({ role: 'user', text: userMessage.text }) // Add current user message to history for the backend

      const requestBody: any = {
        session_id: currentChatSessionId,
        user_id: userId,
        message: userMessage.text,
        message_type: messageType,
        chatHistory: payloadHistory
      }

      if (isVoice && audioBlob) {
        // If it's a voice message, send base64 audio data for transcription/processing
        const reader = new FileReader()
        reader.readAsDataURL(audioBlob)
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1]
          requestBody.audio_data = base64Audio
          await fetchBackendChatResponse(requestBody)
        }
      } else {
        // For text messages, just send the request body
        await fetchBackendChatResponse(requestBody)
      }

    } catch (error: any) {
      console.error("DIAG: Error in handleSendMessage (pre-backend-fetch):", error)
      setCurrentAlert({ message: `Error sending message: ${error.message || "Unknown error"}`, type: "error" })
      setIsSendingMessage(false)
    }
  }, [messageInput, db, userId, currentChatSessionId, isAuthReady, chatMessages, chatSessions, fetchBackendChatResponse, setCurrentAlert, setIsSendingMessage, appId])


  const handleStartVoiceRecording = useCallback(async () => {
    console.log("DIAG: Attempting to start voice recording.")
    if (typeof window === 'undefined' || !navigator.mediaDevices) {
      console.error("MediaDevices not supported in this environment.")
      setCurrentAlert({ message: "Voice recording not supported in this browser.", type: "error" })
      return
    }
    if (!currentChatSessionId) {
      setCurrentAlert({ message: "Please start a new chat session before recording voice.", type: "warning" })
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data)
      }
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        console.log("DIAG: Audio recording stopped, blob created:", audioBlob)
        setMessageInput("[Voice Message]") // Indicate a voice message was sent
        await handleSendMessage(true, audioBlob)
        audioChunksRef.current = [] // Clear chunks for next recording
        stream.getTracks().forEach(track => track.stop()) // Stop microphone track
      }
      mediaRecorderRef.current.start()
      setIsVoiceRecording(true)
      setCurrentAlert({ message: "Recording voice...", type: "info" })
      console.log("DIAG: Voice recording started.")
    } catch (err: any) {
      console.error("DIAG: Error accessing microphone:", err)
      setCurrentAlert({ message: `Failed to start voice recording. Check microphone permissions. Error: ${err.message}`, type: "error" })
    }
  }, [currentChatSessionId, handleSendMessage, setMessageInput, setIsVoiceRecording, setCurrentAlert])


  const handleStopVoiceRecording = useCallback(() => {
    console.log("DIAG: Attempting to stop voice recording.")
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
      setIsVoiceRecording(false)
      setCurrentAlert({ message: "Voice recording stopped. Sending...", type: "info" })
      console.log("DIAG: Voice recording stopped.")
    }
  }, [setIsVoiceRecording, setCurrentAlert])

  const handleRunAnalysis = async () => {
    console.log("DIAG: handleRunAnalysis called.")
    if (!analysisCurrencyPair || analysisTimeframes.length === 0 || !analysisBalance || !analysisLeverage) {
      setCurrentAlert({ message: "Please select a Currency Pair, at least one Timeframe, Available Balance, and Leverage.", type: "warning" })
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
    console.log("DIAG: Running analysis with input:", analysisInput, "to backend:", BACKEND_BASE_URL + "/run_ormcr_analysis")

    try {
      const response = await fetchWithRetry(`${BACKEND_BASE_URL}/run_ormcr_analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...analysisInput, userId }),
      })

      const data: AnalysisResult = await response.json()
      if (!data.ai_suggestion || !data.ai_suggestion.entry_price) {
        throw new Error("Invalid analysis response: Missing required AI suggestion fields.")
      }
      setAnalysisResult(data)
      setCurrentAlert({ message: "ORSCR Analysis completed!", type: "success" })
      console.log("DIAG: Analysis results received:", data)

    } catch (error: any) {
      console.error("DIAG: Error running ORMCR analysis:", error)
      setAnalysisError(error.message || "Failed to run analysis.")
      setCurrentAlert({ message: `Analysis failed: ${error.message || "Unknown error"}. Check backend deployment.`, type: "error" })
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
      // Sort timeframes in a specific order (e.g., largest to smallest duration)
      const order = ['D1', 'H4', 'H1', 'M30', 'M15', 'M5', 'M1']
      return newTimeframes.sort((a, b) => order.indexOf(a) - order.indexOf(b))
    })
  }

  const handleChatAboutAnalysis = () => {
    console.log("DIAG: handleChatAboutAnalysis called.")
    if (analysisResults && analysisResults.market_summary) {
      const analysisSummary = analysisResults.market_summary
      setMessageInput(`Regarding the recent analysis for ${analysisCurrencyPair}:\n\n${analysisSummary}\n\nWhat do you think about this?`)
      setActiveView("chat")
      setCurrentAlert({ message: "Prepared chat message about analysis. Switched to Chat view.", type: "info" })
    } else {
      setCurrentAlert({ message: "No analysis results to chat about.", type: "warning" })
    }
  }

  // Trade Log Handlers
  const handleAddTradeLog = async () => {
    console.log("DIAG: handleAddTradeLog called.")
    if (!tradeLogForm.currencyPair || !tradeLogForm.entryPrice || !tradeLogForm.exitPrice || !tradeLogForm.volume) {
      setCurrentAlert({ message: "Please fill in all trade log fields.", type: "warning" })
      return
    }
    if (!db || !userId || !isAuthReady) {
      setCurrentAlert({ message: "Trade log service not ready. Please wait a moment for authentication to complete.", type: "warning" })
      console.warn("DIAG: Attempted to add trade log, but Firebase not ready. State: db:", !!db, "userId:", !!userId, "isAuthReady:", isAuthReady)
      return
    }

    setIsAddingTrade(true)
    setTradeLogError(null)

    try {
      const entryPriceNum = parseFloat(tradeLogForm.entryPrice)
      const exitPriceNum = parseFloat(tradeLogForm.exitPrice)
      const volumeNum = parseFloat(tradeLogForm.volume)

      if (isNaN(entryPriceNum) || isNaN(exitPriceNum) || isNaN(volumeNum)) {
          throw new Error("Invalid number format for price or volume.")
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

      setCurrentAlert({ message: "Trade log added successfully!", type: "success" })
      setTradeLogForm({
        currencyPair: "BTC/USD",
        entryPrice: "",
        exitPrice: "",
        volume: "",
        profitOrLoss: "",
      })
      console.log("DIAG: Trade log added:", tradeLogEntry)
    } catch (error: any) {
      console.error("DIAG: Error adding trade log:", error)
      setTradeLogError(error.message || "Failed to add trade log.")
      setCurrentAlert({ message: `Failed to add trade log: ${error.message}`, type: "error" })
    } finally {
      setIsAddingTrade(false)
    }
  }

  const handleSaveJournalEntry = async () => {
    console.log("DIAG: handleSaveJournalEntry called.")
    if (!selectedTradeForJournal || !journalEntry.trim()) {
      setCurrentAlert({ message: "Please select a trade and write a journal entry.", type: "warning" })
      return
    }
    if (!db || !userId || !isAuthReady) {
      setCurrentAlert({ message: "Journal save service not ready. Please wait a moment for authentication to complete.", type: "warning" })
      console.warn("DIAG: Attempted to save journal, but Firebase not ready. State: db:", !!db, "userId:", !!userId, "isAuthReady:", isAuthReady)
      return
    }

    setIsSavingJournal(true)
    setTradeLogError(null)

    try {
      const tradeDocRef = doc(db, `artifacts/${appId}/users/${userId}/tradeLogs`, selectedTradeForJournal)
      await updateDoc(tradeDocRef, {
        journalEntry: journalEntry,
      })

      setCurrentAlert({ message: "Journal entry saved successfully!", type: "success" })
      setJournalEntry("")
      setSelectedTradeForJournal(null)
      console.log("DIAG: Journal entry saved for trade:", selectedTradeForJournal)
    } catch (error: any) {
      console.error("DIAG: Error saving journal entry:", error)
      setTradeLogError(error.message || "Failed to save journal entry.")
      setCurrentAlert({ message: `Failed to save journal entry: ${error.message}`, type: "error" })
    } finally {
      setIsSavingJournal(false)
    }
  }

  // Handler to trigger the custom confirmation modal
  const handleDeleteTradeLogClick = (tradeId: string) => {
    console.log("DIAG: handleDeleteTradeLogClick called for tradeId:", tradeId)
    setTradeIdToDelete(tradeId)
    setShowConfirmDeleteModal(true)
  }

  // Actual deletion handler (called by custom modal)
  const confirmDeleteTradeLog = async () => {
    console.log("DIAG: confirmDeleteTradeLog called for tradeId:", tradeIdToDelete)
    setShowConfirmDeleteModal(false) // Close modal
    if (!tradeIdToDelete) return

    if (!db || !userId || !isAuthReady) {
      setCurrentAlert({ message: "Trade log deletion service not ready. Please wait a moment for authentication to complete.", type: "warning" })
      console.warn("DIAG: Attempted to delete trade log, but Firebase not ready. State: db:", !!db, "userId:", !!userId, "isAuthReady:", isAuthReady)
      return
    }

    setTradeLogError(null)
    try {
      const tradeDocRef = doc(db, `artifacts/${appId}/users/${userId}/tradeLogs`, tradeIdToDelete)
      await deleteDoc(tradeDocRef)
      setCurrentAlert({ message: "Trade log deleted successfully!", type: "success" })
      console.log("DIAG: Trade log deleted:", tradeIdToDelete)
      setTradeIdToDelete(null) // Clear the ID after deletion
    } catch (error: any) {
      console.error("DIAG: Error deleting trade log:", error)
      setTradeLogError(error.message || "Failed to delete trade log.")
      setCurrentAlert({ message: `Failed to delete trade log: ${error.message}`, type: "error" })
    }
  }

  // Cancel deletion handler
  const cancelDeleteTradeLog = () => {
    console.log("DIAG: cancelDeleteTradeLog called.")
    setShowConfirmDeleteModal(false)
    setTradeIdToDelete(null)
    setCurrentAlert({ message: "Trade log deletion cancelled.", type: "info" })
  }

  const handleChatInputKeyDown = useCallback(async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    console.log("DIAG: KeyDown detected:", e.key, "Shift pressed:", e.shiftKey, "isSendingMessage:", isSendingMessage)

    if (e.key === 'Enter') {
      if (e.shiftKey) {
        console.log("DIAG: Shift + Enter detected. Allowing default (new line).")
        // Default behavior of textarea is to add a new line with Shift+Enter
      } else {
        e.preventDefault() // Prevent default Enter behavior (new line)
        console.log("DIAG: Enter (no Shift) detected. Preventing default, attempting to send message.")
        if (!isSendingMessage) {
            if (messageInput.trim()) {
              if (!currentChatSessionId) {
                console.log("DIAG: No current chat session, attempting to create new conversation before sending.")
                const newSessionId = await handleNewConversation()
                if (newSessionId) {
                    await handleSendMessage()
                } else {
                    console.error("DIAG: Failed to create new conversation, message not sent.")
                }
              } else {
                await handleSendMessage()
              }
            } else {
              console.log("DIAG: Message input is empty or whitespace, not sending.")
            }
        } else {
            console.log("DIAG: Already sending message, ignoring Enter key press.")
        }
      }
    }
  }, [messageInput, isSendingMessage, currentChatSessionId, handleSendMessage, handleNewConversation])


  // --- USE EFFECTS ---

  useEffect(() => {
    console.log("DIAG: useEffect for chat sessions listener triggered. db ready:", !!db, "userId ready:", !!userId, "isAuthReady:", isAuthReady)
    if (db && userId && isAuthReady) {
      const sessionsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/chatSessions`)
      // Removed orderBy from query as per guidelines to avoid index issues
      const q = query(sessionsCollectionRef)

      const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log("DIAG: onSnapshot for chat sessions received data.")
        const sessions = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || "Untitled Chat",
          createdAt: doc.data().createdAt,
          lastMessageText: doc.data().lastMessageText || "No messages yet.",
          lastMessageTimestamp: doc.data().lastMessageTimestamp || null
        })) as ChatSession[]

        // Client-side sort by createdAt descending
        sessions.sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return dateB - dateA; // Descending order
        });

        setChatSessions(sessions)

        if (!currentChatSessionId || !sessions.some(s => s.id === currentChatSessionId)) {
          if (sessions.length > 0) {
            setCurrentChatSessionId(sessions[0].id)
            console.log("DIAG: Setting currentChatSessionId to most recent:", sessions[0].id)
          } else {
            setCurrentChatSessionId(null)
            console.log("DIAG: No chat sessions found, setting currentChatSessionId to null.")
          }
        }
      }, (error: any) => {
        console.error("DIAG: Error fetching chat sessions:", error)
        setCurrentAlert({ message: `Failed to load chat sessions: ${error.message || 'Unknown error'}`, type: "error" })
      })

      return () => {
        console.log("DIAG: Cleaning up chat sessions listener.")
        unsubscribe()
      }
    } else {
      setChatSessions([])
      console.log("DIAG: Chat sessions cleared or listener skipped. (db:", !!db, "userId:", !!userId, "isAuthReady:", isAuthReady, ")")
    }
  }, [db, userId, currentChatSessionId, isAuthReady, setChatSessions, setCurrentChatSessionId, setCurrentAlert, appId])


  useEffect(() => {
    console.log("DIAG: useEffect for chat messages listener triggered. db ready:", !!db, "userId ready:", !!userId, "currentChatSessionId:", !!currentChatSessionId, "isAuthReady:", isAuthReady)
    if (db && userId && currentChatSessionId && isAuthReady) {
      const messagesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/chatSessions/${currentChatSessionId}/messages`)
      // Removed orderBy from query
      const q = query(messagesCollectionRef)

      const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log("DIAG: onSnapshot for chat messages received data for session:", currentChatSessionId)
        const messages = snapshot.docs.map(doc => ({
          id: doc.id,
          sender: doc.data().sender,
          text: doc.data().text,
          timestamp: doc.data().timestamp,
          type: doc.data().type || 'text',
          audioUrl: doc.data().audioUrl || undefined,
          analysis: doc.data().analysis || undefined,
        })) as ChatMessage[]

        // Client-side sort by timestamp ascending
        messages.sort((a, b) => {
          const dateA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
          const dateB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
          return dateA - dateB; // Ascending order
        });
        setChatMessages(messages)
      }, (error: any) => {
        console.error("DIAG: Error fetching messages for session", currentChatSessionId, ":", error)
        setCurrentAlert({ message: `Failed to load messages for chat session ${currentChatSessionId}: ${error.message || 'Unknown error'}.`, type: "error" })
      })

      return () => {
        console.log("DIAG: Cleaning up chat messages listener.")
        unsubscribe()
      }
    } else {
      setChatMessages([])
      console.log("DIAG: Chat messages cleared or listener skipped. (db:", !!db, "userId:", !!userId, "currentChatSessionId:", !!currentChatSessionId, "isAuthReady:", isAuthReady, ")")
    }
  }, [db, userId, currentChatSessionId, isAuthReady, setChatMessages, setCurrentAlert, appId])

  useEffect(() => {
    if (chatMessagesEndRef.current) {
        chatMessagesEndRef.current.scrollIntoView({ behavior: "smooth" })
        console.log("DIAG: Scrolled chat messages into view.")
    }
  }, [chatMessages, activeView, isChatHistoryMobileOpen])


  const fetchMarketPricesData = useCallback(async (initialLoad = false) => {
    console.log("DIAG: Fetching market prices from:", BACKEND_BASE_URL + "/all_market_prices")
    try {
      if (initialLoad) {
        setLoadingPrices(true)
      }
      setErrorPrices(null)
      const response = await fetchWithRetry(`${BACKEND_BASE_URL}/all_market_prices`, {})
      const data: AllMarketPrices = await response.json()
      setMarketPrices(data)
      console.log("DIAG: Market prices fetched successfully.", data)
    } catch (error: any) {
      console.error("DIAG: Error fetching market prices:", error)
      setErrorPrices(error.message || "Failed to fetch market prices. Using mock data.")
      // Provide mock data on error for development purposes
      setMarketPrices({
        BTCUSDT: { price: 50000, percent_change: 1.5, rsi: 70, macd: 200, stoch_k: 80, volume: 1000, orscr_signal: "BUY" },
        ETHUSDT: { price: 3000, percent_change: -0.5, rsi: 50, macd: -100, stoch_k: 60, volume: 500, orscr_signal: "SELL" },
        ADAUSDT: { price: 0.45, percent_change: 2.1, rsi: 65, macd: 5, stoch_k: 75, volume: 200, orscr_signal: "NEUTRAL" },
        SOLUSDT: { price: 150, percent_change: 3.2, rsi: 75, macd: 150, stoch_k: 90, volume: 700, orscr_signal: "BUY" },
      })
      setCurrentAlert({ message: `Market data fetch failed: ${error.message}. Using mock data.`, type: "error" })
    } finally {
      if (initialLoad) {
        setLoadingPrices(false)
      }
    }
  }, [BACKEND_BASE_URL, fetchWithRetry, setCurrentAlert])


  useEffect(() => {
    fetchMarketPricesData(true) // Initial fetch
    const intervalId = setInterval(() => fetchMarketPricesData(false), 10000) // Fetch every 10 seconds
    return () => clearInterval(intervalId) // Cleanup on unmount
  }, [fetchMarketPricesData])


  const fetchAnalysisLivePrice = useCallback(async (pair: string) => {
    console.log("DIAG: Fetching analysis live price for:", pair, "from:", BACKEND_BASE_URL + "/all_market_prices")
    try {
      const backendSymbol = pair.replace('/', '') + 'T' // e.g., BTC/USD -> BTCUSDT
      const response = await fetchWithRetry(`${BACKEND_BASE_URL}/all_market_prices`, {})
      const data: AllMarketPrices = await response.json()
      if (data[backendSymbol] && typeof data[backendSymbol].price === 'number') {
        setCurrentLivePrice(data[backendSymbol].price.toLocaleString())
        console.log("DIAG: Analysis live price fetched:", data[backendSymbol].price)
      } else {
        setCurrentLivePrice('N/A')
        console.warn("DIAG: Analysis live price not found for", backendSymbol, data)
      }
    } catch (e: any) {
      console.error("DIAG: Error fetching live price for analysis page:", e)
      setCurrentLivePrice('Error')
      setCurrentAlert({ message: `Failed to fetch live price for analysis: ${e.message}`, type: "error" })
    }
  }, [BACKEND_BASE_URL, fetchWithRetry, setCurrentAlert])

  useEffect(() => {
    if (activeView === 'analysis') {
      fetchAnalysisLivePrice(analysisCurrencyPair) // Initial fetch when entering analysis view
      const intervalId = setInterval(() => fetchAnalysisLivePrice(analysisCurrencyPair), 10000) // Update every 10 seconds
      return () => clearInterval(intervalId) // Cleanup on unmount or view change
    }
  }, [activeView, analysisCurrencyPair, fetchAnalysisLivePrice])

  useEffect(() => {
    console.log("DIAG: useEffect for trade logs listener triggered. db ready:", !!db, "userId ready:", !!userId, "isAuthReady:", isAuthReady)
    if (db && userId && isAuthReady) {
      setLoadingTradeLogs(true)
      const tradeLogsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/tradeLogs`)
      // Removed orderBy from query
      const q = query(tradeLogsCollectionRef)

      const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log("DIAG: onSnapshot for trade logs received data.")
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

        // Client-side sort by timestamp descending
        logs.sort((a, b) => {
          const dateA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
          const dateB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
          return dateB - dateA; // Descending order
        });

        setTradeLogs(logs)
        setLoadingTradeLogs(false)
      }, (error: any) => {
        console.error("DIAG: Error fetching trade logs:", error)
        setTradeLogError(error.message || "Failed to load trade logs.")
        setCurrentAlert({ message: `Failed to load trade logs: ${error.message || 'Unknown error'}`, type: "error" })
        setLoadingTradeLogs(false)
      })

      return () => {
        console.log("DIAG: Cleaning up trade logs listener.")
        unsubscribe()
      }
    } else {
      setTradeLogs([])
      setLoadingTradeLogs(false)
      console.log("DIAG: Trade logs listener not ready. Skipping. (db:", !!db, "userId:", !!userId, "isAuthReady:", isAuthReady, ")")
    }
  }, [db, userId, isAuthReady, setLoadingTradeLogs, setTradeLogs, setTradeLogError, setCurrentAlert, appId])

  useEffect(() => {
    // Basic checks for environment variables on component mount
    if (!process.env.NEXT_PUBLIC_APP_ID) {
      setCurrentAlert({ message: "App ID is missing. Please configure NEXT_PUBLIC_APP_ID in environment variables.", type: "error" })
    }
    if (!process.env.NEXT_PUBLIC_BACKEND_BASE_URL) {
      setCurrentAlert({ message: "Backend URL is missing. Using default localhost URL. This might cause issues if backend is not local.", type: "warning" })
    }
  }, [])


  // Render a loading state while authentication is in progress
  if (!isAuthReady) {
    console.log("DIAG: Firebase authentication not ready. Displaying loading screen.")
    return (
      <div className="flex h-screen items-center justify-center bg-[#0A0F2A] text-gray-200">
        <svg className="animate-spin h-8 w-8 text-purple-400 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-xl">Authenticating with Firebase...</p>
      </div>
    )
  }

  // Main UI render after authentication
  return (
    <div className="flex h-screen bg-[#0A0F2A] text-gray-200 font-sans">
      {/* Global CSS for custom scrollbar (using <style jsx global> for Next.js) */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1A1F40; /* Darker track for better contrast */
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #6B46C1; /* Purple thumb */
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #7C3AED; /* Lighter purple on hover */
        }
      `}</style>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[#0A0F2A]/90 backdrop-blur-sm transition-transform md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } border-r border-purple-500/20`} {/* Added border for definition */}
      >
        <div className="flex h-16 items-center justify-between px-6 border-b border-purple-500/20">
          <div className="flex items-center space-x-2">
            <Bot className="h-6 w-6 text-purple-400" />
            <span className="text-xl font-semibold text-white">Aura Bot</span>
          </div>
          <button className="md:hidden p-1 rounded-md hover:bg-gray-700/50" onClick={() => setSidebarOpen(false)}>
            <X className="h-6 w-6 text-gray-400" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 px-4 py-4">
          {['dashboard', 'chat', 'analysis', 'trade-log', 'settings'].map(view => (
            <a
              key={view}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                activeView === view
                  ? "bg-gradient-to-r from-purple-600/50 to-blue-600/50 text-white shadow-md"
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

      {/* Main content area */}
      <div className="flex flex-1 flex-col md:pl-64">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between bg-[#0A0F2A]/90 backdrop-blur-sm px-6 border-b border-purple-500/20">
          <button className="md:hidden p-1 rounded-md hover:bg-gray-700/50" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-6 w-6 text-gray-400" />
          </button>
          <h1 className="text-xl font-semibold text-white">Aura Trading Dashboard</h1>
          <div className="ml-auto flex items-center space-x-4">
            <Bell className="h-6 w-6 text-gray-400" />
            <span className="text-sm text-gray-400 mr-2">User ID: {userId ? `${userId.substring(0, 8)}...` : 'Loading...'}</span>
            <User className="h-6 w-6 text-gray-400" />
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          <main className="flex-1 p-6">
            {currentAlert && <CustomAlert message={currentAlert.message} type={currentAlert.type} onClose={() => setCurrentAlert(null)} />}
            {showConfirmDeleteModal && (
              <CustomConfirmModal
                message="Are you sure you want to delete this trade log? This action cannot be undone."
                onConfirm={confirmDeleteTradeLog}
                onCancel={cancelDeleteTradeLog}
              />
            )}

            {/* Dashboard View (Market Overview) */}
            {activeView === "dashboard" && (
              <div className="flex flex-col space-y-6">
                <h2 className="text-2xl font-bold text-white mb-6">Market Overview</h2>
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

                {/* Dashboard Trading Performance & Recent Alerts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-800/20 rounded-lg p-6 shadow-lg border border-purple-500/10 backdrop-blur-sm">
                    <h3 className="text-xl font-semibold text-white mb-4">Trading Performance</h3>
                    {loadingTradeLogs ? (
                      <p className="text-gray-400">Loading performance data...</p>
                    ) : tradeLogs.length === 0 ? (
                      <p className="text-gray-400">No trades logged yet. Log trades to see performance.</p>
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
                            {tradeLogs.length > 0 ? ((tradeLogs.filter(t => t.profitOrLoss > 0).length / tradeLogs.length) * 100).toFixed(1) : '0.0'}%
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

                {/* Dashboard Market Selection (now an actual dropdown for filtering) */}
                <div className="bg-gray-800/20 rounded-lg p-6 shadow-lg border border-purple-500/10 backdrop-blur-sm">
                  <h3 className="text-xl font-semibold text-white mb-4">Market Selection</h3>
                  <select
                    className="w-full bg-gray-800/30 border border-gray-600/50 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    onChange={(e) => {
                      const selectedPairFilter = e.target.value;
                      // This filtering logic would ideally be applied to a copy of the full market data
                      // For now, it will act as a visual selection if `marketPrices` only contains filtered data.
                      // If `marketPrices` always holds ALL data, this would need more complex state management.
                      console.log("DIAG: Market selection changed to:", selectedPairFilter);
                      // In a real app, you might re-fetch or filter `marketPrices` state here.
                      // For this example, let's just log the selection.
                      setCurrentAlert({ message: `Market filter set to: ${selectedPairFilter || 'All Markets'}`, type: "info" });
                    }}
                  >
                    <option value="">All Markets</option>
                    <option value="BTC">BTC/USD</option>
                    <option value="ETH">ETH/USD</option>
                    <option value="ADA">ADA/USD</option>
                    <option value="SOL">SOL/USD</option>
                    <option value="DOGE">DOGE/USD</option>
                    <option value="XRP">XRP/USD</option>
                  </select>
                </div>
              </div>
            )}

            {/* Chat View */}
            {activeView === "chat" && (
              <div className="flex flex-col h-[calc(100vh-120px)] md:flex-row bg-gray-800/10 rounded-lg shadow-xl overflow-hidden border border-purple-500/10 backdrop-blur-sm relative">
                {/* Chat Header for Mobile */}
                <div className="md:hidden flex items-center justify-between p-4 border-b border-purple-500/20 flex-shrink-0">
                  <button
                    className="text-gray-400 hover:text-white p-1 rounded-md"
                    onClick={() => {
                      if (currentChatSessionId) {
                        setCurrentChatSessionId(null)
                        setChatMessages([])
                        setCurrentAlert({ message: "Current chat cleared.", type: "info" });
                      } else {
                        setCurrentAlert({ message: "No active chat to clear.", type: "info" });
                      }
                    }}
                    title="Clear Current Chat"
                  >
                    {currentChatSessionId ? <X className="h-6 w-6" /> : null}
                  </button>
                  <div className="flex-1 text-center font-semibold text-lg text-gray-200">
                    Aura Bot {userId ? `(${userId.substring(0, 8)}...)` : ""}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={handleNewConversation}
                      className="p-2 rounded-full bg-purple-600/80 hover:bg-purple-700/80 text-white flex items-center justify-center transition-all duration-200"
                      title="New Chat"
                    >
                      <SquarePen className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => setIsChatHistoryMobileOpen(true)}
                      className="p-2 rounded-full bg-gray-700/50 hover:bg-gray-600/50 text-gray-200 flex items-center justify-center transition-all duration-200"
                      title="View History"
                    >
                      <History className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Main Chat Content Area */}
                {currentChatSessionId ? (
                  <div className="flex-1 flex flex-col relative overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar" style={{ paddingBottom: '88px' }}>
                      <div className="space-y-4">
                        {chatMessages.map(msg => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[80%] p-3 rounded-xl ${
                                msg.sender === "user"
                                  ? "bg-gradient-to-r from-purple-600/80 to-blue-600/80 text-white"
                                  : "bg-gray-700/30 text-gray-200 backdrop-blur-sm"
                              } break-words`}
                            >
                              {msg.type === 'audio' && msg.audioUrl ? (
                                <div>
                                  <audio controls src={msg.audioUrl} className="mt-2 w-full" />
                                  <p className="text-xs text-gray-300 mt-1">{msg.text}</p>
                                </div>
                              ) : msg.type === 'analysis' && msg.analysis ? (
                                <div>
                                  <p className="font-semibold text-lg mb-2">{msg.text}</p>
                                  <div className="mt-2 p-3 bg-gray-800/20 rounded-lg border border-purple-500/10">
                                    <p className="text-sm"><strong>Symbol:</strong> {msg.analysis.symbol || 'N/A'}</p>
                                    <p className="text-sm"><strong>Confidence:</strong> {msg.analysis.confidence_score || 'N/A'}</p>
                                    <p className="text-sm"><strong>Signal:</strong> {msg.analysis.ai_suggestion?.signal || 'N/A'}</p>
                                    <p className="text-sm"><strong>Action:</strong> {msg.analysis.ai_suggestion?.recommended_action || 'N/A'}</p>
                                    {/* Optionally add more details from analysisResults here */}
                                    <button
                                      onClick={() => {
                                        setAnalysisResult(msg.analysis); // Set analysis result to display in analysis tab
                                        setActiveView('analysis'); // Switch to analysis tab
                                        setCurrentAlert({ message: "Analysis details loaded in Analysis tab.", type: "info" });
                                      }}
                                      className="mt-3 text-sm bg-blue-600/60 hover:bg-blue-700/60 rounded-md px-3 py-1 transition-colors"
                                    >
                                      View Full Analysis
                                    </button>
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

                    {/* Input area (fixed at bottom) */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-[#0A0F2A]/90 border-t border-purple-500/20 z-10">
                      <div className="relative flex items-center w-full bg-gray-800/30 rounded-lg border border-purple-500/10 pr-2">
                        <textarea
                          placeholder="Ask anything (Shift + Enter for new line)"
                          className="flex-1 bg-transparent text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y min-h-[40px] max-h-[120px] custom-scrollbar"
                          value={messageInput}
                          onChange={(e) => setMessageInput(e.target.value)}
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
                          onClick={isVoiceRecording ? handleStopVoiceRecording : handleStartVoiceRecording}
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
                  // Empty State (Grok-like initial screen for chat)
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
                          onChange={(e) => setMessageInput(e.target.value)}
                          onKeyDown={handleChatInputKeyDown}
                          rows={Math.min(5, (messageInput.split('\n').length || 1))}
                          disabled={isSendingMessage}
                        />
                        <button
                          className="p-2 text-white rounded-full bg-purple-600/80 hover:bg-purple-700/80 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 transition-all duration-200"
                          onClick={async () => {
                            if (messageInput.trim()) {
                              const newSessionId = await handleNewConversation()
                              if (newSessionId) {
                                await handleSendMessage()
                              } else {
                                setCurrentAlert({ message: "Failed to start new chat. Try again.", type: "error" });
                              }
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
                              if (!newSessionId) {
                                setCurrentAlert({ message: "Failed to start new chat for voice. Try again.", type: "error" });
                                return;
                              }
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

                {/* Right Overlay Chat History Sidebar */}
                <div
                  className={`fixed inset-y-0 right-0 z-50 w-full md:w-80 flex-col bg-[#0A0F2A]/90 border-l border-purple-500/20 backdrop-blur-sm transition-transform ease-out duration-300 ${
                    isChatHistoryMobileOpen ? "translate-x-0" : "translate-x-full"
                  } flex`}
                >
                  <div className="flex items-center justify-between p-4 border-b border-purple-500/20 flex-shrink-0">
                    <h3 className="text-xl font-extrabold text-purple-400">History</h3>
                    <button onClick={() => setIsChatHistoryMobileOpen(false)} className="text-gray-400 hover:text-white p-1 rounded-md">
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
                            session.id === currentChatSessionId ? 'bg-gradient-to-r from-purple-600/50 to-blue-600/50 text-white shadow-lg' : 'bg-gray-700/30 text-gray-200 hover:bg-gray-600/30'
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
                  <div className="p-4 border-t border-purple-500/20 flex-shrink-0">
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

            {/* Analysis View */}
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
                          onChange={(e) => setAnalysisCurrencyPair(e.target.value)}
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
                          onChange={(e) => setAnalysisTradeType(e.target.value)}
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
                      {availableIndicators.map((indicator) => (
                        <div
                          key={indicator.name}
                          className="flex items-center justify-between p-2 hover:bg-gray-700/20 rounded"
                        >
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
                          onChange={(e) => setAnalysisBalance(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Leverage</label>
                        <select
                          className="w-full bg-gray-800/30 border border-gray-600/50 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          value={analysisLeverage}
                          onChange={(e) => setAnalysisLeverage(e.target.value)}
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
                    {!loadingPrices && !errorPrices ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-3 bg-gray-700/20 rounded-lg">
                          <div className="text-sm text-gray-400">Current Price</div>
                          <div className="text-lg font-bold text-white">
                            ${currentLivePrice}
                          </div>
                        </div>
                        <div className="text-center p-3 bg-gray-700/20 rounded-lg">
                          <div className="text-sm text-gray-400">24h Change</div>
                          {(() => {
                              const percentChange = marketPrices[analysisCurrencyPair.replace('/', 'USDT')]?.percent_change;
                              const isNumber = typeof percentChange === 'number';
                              const textColor = isNumber && percentChange >= 0 ? 'text-emerald-400' : 'text-red-400';
                              return (
                                  <div className={`text-lg font-bold ${textColor}`}>
                                      {isNumber ? `${percentChange.toFixed(2)}%` : 'N/A'}
                                  </div>
                              );
                          })()}
                        </div>
                        <div className="text-center p-3 bg-gray-700/20 rounded-lg">
                          <div className="text-sm text-gray-400">Volume</div>
                          {(() => {
                            const volume = marketPrices[analysisCurrencyPair.replace('/', 'USDT')]?.volume;
                            const isVolumeNumber = typeof volume === 'number';
                            return (
                                <div className="text-lg font-bold text-blue-400">
                                    {isVolumeNumber ? volume.toFixed(2) : 'N/A'}
                                </div>
                            );
                          })()}
                        </div>
                        <div className="text-center p-3 bg-gray-700/20 rounded-lg">
                          <div className="text-sm text-gray-400">Signal</div>
                          <div className={`text-lg font-bold ${
                              marketPrices[analysisCurrencyPair.replace('/', 'USDT')]?.orscr_signal === "BUY" ? 'text-emerald-500' :
                              marketPrices[analysisCurrencyPair.replace('/', 'USDT')]?.orscr_signal === "SELL" ? 'text-red-500' : 'text-amber-500'
                          }`}>
                              {marketPrices[analysisCurrencyPair.replace('/', 'USDT')]?.orscr_signal || 'N/A'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-400">Select a currency pair to see live data.</p>
                    )}
                  </div>

                  <div className="bg-gray-800/20 rounded-xl shadow-lg border border-emerald-500/10 backdrop-blur-sm p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-semibold text-emerald-300">AI Analysis Results</h3>
                      <div className="flex items-center text-purple-400">
                        <Bot className="w-5 h-5 mr-2" />
                        <span className="text-sm">Powered by Gemini AI</span>
                      </div>
                    </div>
                    {isAnalyzing && (
                      <div className="text-center p-10 text-gray-500">
                        <div className="flex items-center justify-center mt-4">
                          <svg className="animate-spin h-5 w-5 text-purple-400 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <p className="mt-2 text-indigo-400">Analyzing...</p>
                        </div>
                      </div>
                    )}

                    {!isAnalyzing && analysisResults ? (
                      <div className="space-y-6">
                        <div className="text-center p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-lg">
                          <div className="text-sm text-emerald-300 mb-2">CONFIDENCE SCORE</div>
                          <div className="text-4xl font-bold text-emerald-400 mb-2">{analysisResults.confidence_score}</div>
                          <div className="text-sm text-emerald-300">{analysisResults.signal_strength}</div>
                        </div>

                        <div className="p-4 bg-gray-700/30 rounded-lg">
                          <h4 className="font-semibold text-white mb-3 flex items-center">
                            <BarChart3 className="w-4 h-4 mr-2" />
                            Market Summary
                          </h4>
                          <p className="text-gray-300 text-sm leading-relaxed">
                            <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                                {analysisResults.market_summary}
                            </ReactMarkdown>
                          </p>
                        </div>

                        <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                          <h4 className="font-semibold text-blue-300 mb-3 flex items-center">
                            <TrendingUp className="w-4 h-4 mr-2" />
                            AI Suggestion
                          </h4>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-300">Entry Type:</span>
                              <span className="font-bold text-emerald-400">{analysisResults.ai_suggestion.entry_type}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-300">Recommended Action:</span>
                              <span className="font-bold text-emerald-400">{analysisResults.ai_suggestion.recommended_action}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-300">Position Size:</span>
                                <span className="font-bold text-white">{analysisResults.ai_suggestion.position_size}</span>
                            </div>
                          </div>
                        </div>

                        {analysisResults.ormcr_confirmation_status === "STRONG CONFIRMATION" && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg text-center">
                              <div className="text-sm text-red-300 mb-1">Stop Loss</div>
                              <div className="text-xl font-bold text-red-400">{analysisResults.stop_loss.price}</div>
                              <div className="text-xs text-red-300">{analysisResults.stop_loss.percentage_change}</div>
                            </div>
                            <div className="p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-lg text-center">
                              <div className="text-sm text-emerald-300 mb-1">Take Profit 1</div>
                              <div className="text-xl font-bold text-emerald-400">{analysisResults.take_profit_1.price}</div>
                              <div className="text-xs text-emerald-300">{analysisResults.take_profit_1.percentage_change}</div>
                            </div>
                            <div className="p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-lg text-center">
                              <div className="text-sm text-emerald-300 mb-1">Take Profit 2</div>
                              <div className="text-xl font-bold text-emerald-400">{analysisResults.take_profit_2.price}</div>
                              <div className="text-xs text-emerald-300">{analysisResults.take_profit_2.percentage_change}</div>
                            </div>
                          </div>
                        )}

                        <div className="p-4 bg-gray-700/30 rounded-lg">
                          <h4 className="font-semibold text-white mb-3">Technical Indicators Analysis</h4>
                          {analysisResults.technical_indicators_analysis && (
                            <div className="mt-2 text-sm text-gray-300">
                              <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                                {analysisResults.technical_indicators_analysis}
                              </ReactMarkdown>
                            </div>
                          )}
                        </div>

                        <div className="p-4 bg-gray-700/30 rounded-lg">
                          <h4 className="font-semibold text-white mb-3">Next Step for User</h4>
                          <p className="text-gray-300 text-sm leading-relaxed">
                            <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                                {analysisResults.next_step_for_user}
                            </ReactMarkdown>
                          </p>
                        </div>

                        <div className="flex gap-4">
                          <button
                            onClick={handleChatAboutAnalysis}
                            className="flex-1 inline-flex items-center justify-center px-5 py-3 rounded-lg font-semibold bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 transition-all duration-200"
                          >
                            <MessageCircle className="w-4 h-4 mr-2" />
                            Chat About This Analysis
                          </button>
                          <button className="inline-flex items-center justify-center px-5 py-3 rounded-lg font-semibold bg-gray-700 text-gray-300 hover:bg-gray-600 transition-all duration-200">
                            <Save className="w-4 h-4 mr-2" />
                            Save Analysis
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-10 text-gray-500">
                        <p>Run an AI analysis to see detailed results here.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Trade Log View */}
            {activeView === "trade-log" && (
              <div className="flex flex-col space-y-6">
                <h2 className="text-2xl font-bold text-white mb-6">Trade Log & Journal</h2>

                {/* Add New Trade Form */}
                <div className="bg-gray-800/20 rounded-xl shadow-lg border border-purple-500/10 backdrop-blur-sm p-6">
                  <h3 className="text-lg font-semibold text-purple-300 mb-4">Add New Trade</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Currency Pair</label>
                      <select
                        className="w-full bg-gray-800/30 border border-gray-600/50 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        value={tradeLogForm.currencyPair}
                        onChange={(e) => setTradeLogForm({ ...tradeLogForm, currencyPair: e.target.value })}
                      >
                        <option>BTC/USD</option>
                        <option>ETH/USD</option>
                        <option>ADA/USD</option>
                        <option>SOL/USD</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Entry Price</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full bg-gray-800/30 border border-gray-600/50 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="e.g., 29500.00"
                        value={tradeLogForm.entryPrice}
                        onChange={(e) => setTradeLogForm({ ...tradeLogForm, entryPrice: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Exit Price</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full bg-gray-800/30 border border-gray-600/50 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="e.g., 29750.00"
                        value={tradeLogForm.exitPrice}
                        onChange={(e) => setTradeLogForm({ ...tradeLogForm, exitPrice: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Volume (Units)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full bg-gray-800/30 border border-gray-600/50 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="e.g., 0.1"
                        value={tradeLogForm.volume}
                        onChange={(e) => setTradeLogForm({ ...tradeLogForm, volume: e.target.value })}
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleAddTradeLog}
                    disabled={isAddingTrade}
                    className="mt-6 w-full inline-flex items-center justify-center px-5 py-3 rounded-lg font-semibold bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 transition-all duration-200 disabled:opacity-50"
                  >
                    {isAddingTrade ? (
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    {isAddingTrade ? "Adding Trade..." : "Add Trade"}
                  </button>
                  {tradeLogError && <p className="text-red-400 text-sm mt-2">{tradeLogError}</p>}
                </div>

                {/* Trade Log Table */}
                <div className="bg-gray-800/20 rounded-xl shadow-lg border border-cyan-500/10 backdrop-blur-sm p-6">
                  <h3 className="text-lg font-semibold text-cyan-300 mb-4">Your Trades</h3>
                  {loadingTradeLogs && <p className="text-gray-400">Loading trade history...</p>}
                  {!loadingTradeLogs && tradeLogs.length === 0 && (
                    <p className="text-gray-400">No trades logged yet. Add your first trade above!</p>
                  )}
                  {!loadingTradeLogs && tradeLogs.length > 0 && (
                    <div className="overflow-x-auto custom-scrollbar rounded-lg border border-gray-700/50">
                      <table className="min-w-full divide-y divide-gray-700/50">
                        <thead className="bg-gray-700/30 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Pair</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Entry</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Exit</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Volume</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">P/L</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Journal</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/50">
                          {tradeLogs.map((trade) => (
                            <tr key={trade.id} className="hover:bg-gray-700/50 transition-colors">
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">
                                {trade.timestamp && typeof trade.timestamp.toDate === 'function' ? trade.timestamp.toDate().toLocaleDateString() : 'N/A'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-white">{trade.currencyPair}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-white">{trade.entryPrice.toFixed(2)}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-white">{trade.exitPrice.toFixed(2)}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-white">{trade.volume.toFixed(2)}</td>
                              <td className={`px-4 py-3 whitespace-nowrap text-sm font-semibold ${trade.profitOrLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {trade.profitOrLoss.toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-400 max-w-xs truncate cursor-pointer"
                                  title={trade.journalEntry || "No journal entry. Click to add/edit."}
                                  onClick={() => { setSelectedTradeForJournal(trade.id); setJournalEntry(trade.journalEntry || ''); }}
                                  >
                                {trade.journalEntry ? trade.journalEntry : "Add Entry"}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                <button
                                  onClick={() => { setSelectedTradeForJournal(trade.id); setJournalEntry(trade.journalEntry || ''); }}
                                  className="text-indigo-400 hover:text-indigo-500 mr-3 p-1 rounded-md hover:bg-gray-700/50"
                                  title="Edit Journal"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTradeLogClick(trade.id)}
                                  className="text-red-400 hover:text-red-500 p-1 rounded-md hover:bg-gray-700/50"
                                  title="Delete Trade"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Journal Entry Editor */}
                {selectedTradeForJournal && (
                  <div className="bg-gray-800/20 rounded-xl shadow-lg border border-emerald-500/10 backdrop-blur-sm p-6">
                    <h3 className="text-lg font-semibold text-emerald-300 mb-4">Journal Entry for Trade ID: {selectedTradeForJournal.substring(0, 8)}...</h3>
                    <textarea
                      className="w-full bg-gray-800/30 border border-gray-600/50 text-white rounded-lg p-4 h-32 resize-y focus:outline-none focus:ring-1 focus:ring-emerald-500 custom-scrollbar"
                      placeholder="Write your thoughts, strategies, and lessons learned from this trade..."
                      value={journalEntry}
                      onChange={(e) => setJournalEntry(e.target.value)}
                    ></textarea>
                    <div className="flex justify-end space-x-3 mt-4">
                      <button
                        onClick={() => { setJournalEntry(""); setSelectedTradeForJournal(null); setCurrentAlert({ message: "Journal entry editing cancelled.", type: "info" }); }}
                        className="px-4 py-2 rounded-lg bg-gray-700/50 text-gray-300 hover:bg-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveJournalEntry}
                        disabled={isSavingJournal}
                        className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        {isSavingJournal ? "Saving..." : "Save Journal Entry"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Settings View */}
            {activeView === "settings" && (
              <div className="flex flex-col space-y-6">
                <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>

                {/* API Configuration */}
                <div className="bg-gray-800/20 rounded-xl shadow-lg border border-blue-500/10 backdrop-blur-sm p-6">
                  <h3 className="text-lg font-semibold text-blue-300 mb-4">API Configuration</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Backend URL (Read-only)</label>
                      <input
                        type="text"
                        readOnly
                        className="w-full bg-gray-800/30 border border-gray-600/50 text-gray-400 rounded-lg px-4 py-2 cursor-not-allowed"
                        value={backendUrlSetting}
                      />
                      <p className="text-xs text-gray-500 mt-1">This is set via environment variables (NEXT_PUBLIC_BACKEND_BASE_URL).</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">App ID (Read-only)</label>
                      <input
                        type="text"
                        readOnly
                        className="w-full bg-gray-800/30 border border-gray-600/50 text-gray-400 rounded-lg px-4 py-2 cursor-not-allowed"
                        value={appId} {/* Displaying the actual appId that's read from env */}
                      />
                      <p className="text-xs text-gray-500 mt-1">This is set via environment variables (NEXT_PUBLIC_APP_ID).</p>
                    </div>
                  </div>
                </div>

                {/* User Preferences */}
                <div className="bg-gray-800/20 rounded-xl shadow-lg border border-purple-500/10 backdrop-blur-sm p-6">
                  <h3 className="text-lg font-semibold text-purple-300 mb-4">User Preferences (Placeholder)</h3>
                  <p className="text-gray-400">Future settings like theme, notification preferences, etc., will be added here.</p>
                  <div className="mt-4">
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" className="form-checkbox text-purple-600 bg-gray-700/30 border-gray-600/50 rounded" disabled />
                      <span className="text-gray-300">Enable Dark Mode (Already default)</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
