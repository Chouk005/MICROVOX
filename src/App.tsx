import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Heart,
  Radio,
  Clock,
  Flame,
  Globe2,
  Send,
  Settings,
  X,
  Trash2,
  MessageSquare,
  Repeat,
  Volume2,
  Trophy,
  Activity,
  Moon,
  Sun,
  User as UserIcon,
  Mail,
  Mic,
  Play,
  Square
} from "lucide-react";
import { Post, PrivateMessage, VoiceNote } from "./types";
import { auth, db, handleFirestoreError, OperationType } from "./firebase";
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from "firebase/auth";
import { collection, doc, onSnapshot, setDoc, query, orderBy, limit, getDocs, updateDoc, increment, serverTimestamp, where } from "firebase/firestore";

const MAX_CHARS = 100;
const STORAGE_KEY = "microvox_posts";
const USER_STORAGE_KEY = "microvox_user";
const SETTINGS_STORAGE_KEY = "microvox_settings";
const LIKES_STORAGE_KEY = "microvox_likes";
const MESSAGES_STORAGE_KEY = "microvox_messages";
const VOICENOTES_STORAGE_KEY = "microvox_voicenotes";
const RESTRICTION_STORAGE_KEY = "microvox_restriction";

// Colors Array
const VINTAGE_COLORS = [
  "#C85A17",
  "#8B4513",
  "#A0522D",
  "#CD853F",
  "#D2691E",
  "#B8860B",
  "#808000",
  "#556B2F",
  "#4A746A",
  "#5F9EA0",
  "#3b82f6",
  "#8b5cf6",
];

const BOTS = [
  { id: "#PIX1", color: "#5F9EA0", name: "Bot-Filósofo" },
  { id: "#NUL2", color: "#B8860B", name: "Bot-Coder" },
  { id: "#ZAP3", color: "#8B4513", name: "Bot-Random" },
];

const BOT_MESSAGES = [
  "Buscando señal en el ruido...",
  "Cargando protocolo de transferencia...",
  "Error: Entidad no reconocida en sector 4.",
  "El algoritmo predice lluvia de datos.",
  "La interferencia es solo información en otro idioma.",
];

const generateRandomColor = () =>
  VINTAGE_COLORS[Math.floor(Math.random() * VINTAGE_COLORS.length)];
const generateShortId = () =>
  "#" + Math.random().toString(36).substr(2, 4).toUpperCase();

const formatId = (id: string) => {
  if (id.startsWith('#')) return id;
  return '#' + id.substring(0, 4).toUpperCase();
};

const GlitchText = ({
  text,
  isActive,
  enabled,
}: {
  text: string;
  isActive: boolean;
  enabled: boolean;
}) => {
  const [displayed, setDisplayed] = useState(text);

  useEffect(() => {
    if (!isActive || !enabled) {
      setDisplayed(text);
      return;
    }
    const chars = "!<>-_\\\\/[]{}—=+*^?#01X";
    const interval = setInterval(() => {
      let newStr = "";
      for (let i = 0; i < text.length; i++) {
        if (Math.random() < 0.05 && text[i] !== " ") {
          newStr += chars[Math.floor(Math.random() * chars.length)];
        } else {
          newStr += text[i];
        }
      }
      setDisplayed(newStr);
    }, 200);
    return () => clearInterval(interval);
  }, [text, isActive, enabled]);
  return <span className="font-serif">{displayed}</span>;
};

// Variants for slide animation
const variants = {
  enter: (direction: number) => {
    return {
      x: direction > 0 ? 1000 : -1000,
      opacity: 0,
    };
  },
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => {
    return {
      zIndex: 0,
      x: direction < 0 ? 1000 : -1000,
      opacity: 0,
    };
  },
};

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [content, setContent] = useState("");
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    color: string;
    name?: string;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<
    "latest" | "trending" | "ranking" | "chat" | "voice"
  >("latest");
  const [[page, direction], setPage] = useState([0, 0]);
  const [viewingUser, setViewingUser] = useState<{
    id: string;
    color: string;
    name?: string;
  } | null>(null);

  const [likedPosts, setLikedPosts] = useState<string[]>([]);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const [rankingSort, setRankingSort] = useState<"likes" | "count">("count");
  const [globalTimeOffset, setGlobalTimeOffset] = useState<number>(0);
  const [restrictedUntil, setRestrictedUntil] = useState<number>(0);

  const getRealTime = () => Date.now() + globalTimeOffset;

  useEffect(() => {
    fetch("https://worldtimeapi.org/api/timezone/Etc/UTC")
      .then((res) => res.json())
      .then((data) => {
        const apiTime = new Date(data.utc_datetime).getTime();
        setGlobalTimeOffset(apiTime - Date.now());
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === "chat" && activeChatId && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "auto" });
    }
  }, [messages, activeTab, activeChatId]);

  const [replyTo, setReplyTo] = useState<Post | null>(null);
  const composeRef = useRef<HTMLTextAreaElement>(null);

  // Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [botsEnabled, setBotsEnabled] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [glitchEffects, setGlitchEffects] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [animationsEnabled, setAnimationsEnabled] = useState(true);

  const postsRef = useRef(posts);
  postsRef.current = posts;
  const botsEnabledRef = useRef(botsEnabled);
  botsEnabledRef.current = botsEnabled;

  const tabIndex = { latest: 0, trending: 1, ranking: 2, chat: 3, voice: 4 };

  const handleTabChange = (
    newTab: "latest" | "trending" | "ranking" | "chat" | "voice",
  ) => {
    const newIndex = tabIndex[newTab];
    const currentIndex = tabIndex[activeTab];
    setPage([newIndex, newIndex > currentIndex ? 1 : -1]);
    setActiveTab(newTab);
    setViewingUser(null);
  };

  const isUserOnline = (id: string) => {
    if (currentUser && id === currentUser.id) return true;
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash += id.charCodeAt(i);
    return hash % 3 !== 0; // 66% stay online deterministically
  };

  const [encryptedMessage, setEncryptedMessage] = useState<string | null>(null);

  const fetchTransmission = async () => {
    try {
      setEncryptedMessage("Descifrando señal foránea...");
      const res = await fetch(
        "https://uselessfacts.jsph.pl/api/v2/facts/random?language=en",
      );
      const data = await res.json();
      setEncryptedMessage(data.text);
    } catch (e) {
      setEncryptedMessage("Ruido estático. Señal perdida.");
    }
  };

  const [authInitialized, setAuthInitialized] = useState(false);

  useEffect(() => {
    fetchTransmission();

    const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (storedSettings) {
      const parsed = JSON.parse(storedSettings);
      if (parsed.botsEnabled !== undefined) setBotsEnabled(parsed.botsEnabled);
      if (parsed.ttsEnabled !== undefined) setTtsEnabled(parsed.ttsEnabled);
      if (parsed.glitchEffects !== undefined) setGlitchEffects(parsed.glitchEffects);
      if (parsed.theme !== undefined) setTheme(parsed.theme);
      if (parsed.animations !== undefined) setAnimationsEnabled(parsed.animations);
    }
    const storedRestriction = localStorage.getItem(RESTRICTION_STORAGE_KEY);
    if (storedRestriction) setRestrictedUntil(parseInt(storedRestriction, 10));

    let unsubs: (() => void)[] = [];

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      unsubs.forEach(u => u());
      unsubs = [];
      
      if (user) {
        // We have a logged in user
        const userRef = doc(db, 'users', user.uid);
        const unsubUser = onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
             setCurrentUser({ ...snapshot.data(), id: snapshot.id } as any);
             setAuthInitialized(true);
          } else {
             // Generate initial identity for them
             const newUser = {
               color: generateRandomColor(),
               name: user.displayName || "",
               createdAt: getRealTime()
             };
             setDoc(userRef, newUser).then(() => {
                 setCurrentUser({ ...newUser, id: user.uid } as any);
                 setAuthInitialized(true);
             }).catch(e => handleFirestoreError(e, OperationType.CREATE, 'users'));
          }
        }, (err) => handleFirestoreError(err, OperationType.GET, 'users'));
        unsubs.push(unsubUser);

        const qPosts = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(100));
        const unsubPosts = onSnapshot(qPosts, (snapshot) => {
          const p: Post[] = [];
          snapshot.forEach(doc => {
             p.push({ id: doc.id, ...doc.data() } as Post);
          });
          setPosts(p);
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'posts'));
        unsubs.push(unsubPosts);

        let msgs1: PrivateMessage[] = [];
        let msgs2: PrivateMessage[] = [];
        const updateMessages = () => {
             const all = [...msgs1, ...msgs2].filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);
             all.sort((a,b) => a.createdAt - b.createdAt);
             setMessages(all);
        };

        const qMessagesFrom = query(collection(db, 'messages'), where('fromId', '==', user.uid));
        const unsubMessagesFrom = onSnapshot(qMessagesFrom, (snapshot) => {
          msgs1 = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PrivateMessage));
          updateMessages();
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'messages'));
        unsubs.push(unsubMessagesFrom);

        const qMessagesTo = query(collection(db, 'messages'), where('toId', '==', user.uid));
        const unsubMessagesTo = onSnapshot(qMessagesTo, (snapshot) => {
          msgs2 = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PrivateMessage));
          updateMessages();
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'messages'));
        unsubs.push(unsubMessagesTo);

        const qVoiceNotes = query(collection(db, 'voiceNotes'), orderBy('createdAt', 'desc'), limit(50));
        const unsubVoiceNotes = onSnapshot(qVoiceNotes, (snapshot) => {
          const v: VoiceNote[] = [];
          snapshot.forEach(doc => {
             v.push({ id: doc.id, ...doc.data() } as VoiceNote);
          });
          setVoiceNotes(v);
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'voiceNotes'));
        unsubs.push(unsubVoiceNotes);

        const storedLikes = localStorage.getItem(LIKES_STORAGE_KEY);
        if (storedLikes) setLikedPosts(JSON.parse(storedLikes));
      } else {
        setCurrentUser(null);
        setPosts([]);
        setMessages([]);
        setVoiceNotes([]);
        setAuthInitialized(true);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubs.forEach(u => u());
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        botsEnabled,
        ttsEnabled,
        glitchEffects,
        theme,
        animations: animationsEnabled,
      }),
    );

    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [botsEnabled, ttsEnabled, glitchEffects, theme, animationsEnabled]);

  useEffect(() => {
    localStorage.setItem(LIKES_STORAGE_KEY, JSON.stringify(likedPosts));
  }, [likedPosts]);
  useEffect(() => {
    if (messages.length > 0)
      localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(messages));
    else localStorage.removeItem(MESSAGES_STORAGE_KEY);
  }, [messages]);
  useEffect(() => {
    if (voiceNotes.length > 0)
      localStorage.setItem(VOICENOTES_STORAGE_KEY, JSON.stringify(voiceNotes));
    else localStorage.removeItem(VOICENOTES_STORAGE_KEY);
  }, [voiceNotes]);
  useEffect(() => {
    if (posts.length > 0)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    else localStorage.removeItem(STORAGE_KEY);
  }, [posts]);

  // Bots
  useEffect(() => {
    // Disabled bots to prevent firebase rule errors since they aren't authenticated
  }, []);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || content.length > MAX_CHARS || !currentUser) return;

    const now = getRealTime();
    if (now < restrictedUntil) {
      alert(
        `Límite de seguridad activo. Inténtalo de nuevo en ${Math.ceil((restrictedUntil - now) / 60000)} minutos.`,
      );
      return;
    }

    const userRecentPosts = posts.filter(
      (p) => p.authorId === currentUser.id && p.createdAt > now - 60000,
    );
    if (userRecentPosts.length >= 20) {
      const banUntil = now + 5 * 60 * 1000;
      setRestrictedUntil(banUntil);
      localStorage.setItem(RESTRICTION_STORAGE_KEY, banUntil.toString());
      alert("Señal de spam detectada. Restricción de 5 minutos aplicada.");
      return;
    }

    const newPostId = Math.random().toString(36).substr(2, 9);
    const newPost: Post = {
      id: newPostId,
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorColor: currentUser.color,
      content: content.trim(),
      likes: 0,
      createdAt: now,
      ...(replyTo
        ? { replyToId: replyTo.id, replyToAuthor: replyTo.authorId }
        : {}),
    };

    try {
      await setDoc(doc(db, 'posts', newPostId), newPost);
      setContent("");
      setReplyTo(null);
      if (activeTab === "ranking") handleTabChange("latest");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'posts');
    }
  };

  const handleReplyClick = (post: Post) => {
    setReplyTo(post);
    if (activeTab === "ranking") handleTabChange("latest");
    setTimeout(() => {
      composeRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      composeRef.current?.focus();
    }, 100);
  };

  const handleLike = async (postId: string) => {
    if (!currentUser) return;
    const isLiked = likedPosts.includes(postId);
    const change = isLiked ? -1 : 1;
    
    // Optimistic local update for likedPosts
    if (isLiked) setLikedPosts((prev) => prev.filter((id) => id !== postId));
    else setLikedPosts((prev) => [...prev, postId]);

    try {
      await updateDoc(doc(db, 'posts', postId), {
        likes: increment(change)
      });
      
      if (isLiked) {
         // Optionally remove like document in subcollection
      } else {
         // Optionally add like document in subcollection
      }
    } catch (err) {
      console.error(err);
      // Revert in case of error
      if (isLiked) setLikedPosts((prev) => [...prev, postId]);
      else setLikedPosts((prev) => prev.filter((id) => id !== postId));
    }
  };

  const handleSpeak = (text: string) => {
    if (!ttsEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 0.8;
    utterance.rate = 1.1;
    const voices = window.speechSynthesis.getVoices();
    const esVoice = voices.find(
      (v) => v.lang.startsWith("es") || v.lang.startsWith("en"),
    );
    if (esVoice) utterance.voice = esVoice;
    window.speechSynthesis.speak(utterance);
  };

  const handleClearData = () => {
    if (window.confirm("¿Purgar toda la memoria local?")) {
      setPosts([]);
      setLikedPosts([]);
    }
  };

  const getRanking = () => {
    const stats: Record<
      string,
      { count: number; likes: number; color: string }
    > = {};
    posts.forEach((p) => {
      if (!stats[p.authorId])
        stats[p.authorId] = { count: 0, likes: 0, color: p.authorColor };
      stats[p.authorId].count += 1;
      stats[p.authorId].likes += p.likes;
    });
    return Object.entries(stats)
      .map(([id, s]) => ({ id, ...s }))
      .sort((a, b) => {
        if (rankingSort === "likes")
          return b.likes - a.likes || b.count - a.count;
        return b.count - a.count || b.likes - a.likes;
      })
      .map((item, index) => ({ ...item, rank: index + 1 }))
      .slice(0, 10);
  };

  const charsLeft = MAX_CHARS - content.length;
  const isOverLimit = charsLeft < 0;

  const startRecording = async () => {
    if (!currentUser) {
      alert("Inicia sesión para enviar transmisiones de voz.");
      return;
    }
    const now = getRealTime();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    const myRecentNotes = voiceNotes.filter(
      (n) => n.authorId === currentUser.id && n.createdAt > twentyFourHoursAgo
    );
    if (myRecentNotes.length >= 10) {
      alert("Límite diario alcanzado: Máximo 10 transmisiones de voz por día.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob); 
        reader.onloadend = async () => {
          const base64AudioMessage = reader.result as string;
          const newVoiceNoteId = Math.random().toString(36).substr(2, 9);
          const newVoiceNote: VoiceNote = {
            id: newVoiceNoteId,
            authorId: currentUser.id,
            authorName: currentUser.name,
            authorColor: currentUser.color,
            audioUrl: base64AudioMessage,
            createdAt: getRealTime(),
          };
          try {
             await setDoc(doc(db, 'voiceNotes', newVoiceNoteId), newVoiceNote);
          } catch (e) {
             console.error(e);
             alert("No se pudo enviar la voz. Asegúrate de tener conexión.");
          }
        };
        stream.getTracks().forEach((track) => track.stop()); 
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
    } catch (err) {
      console.error(err);
      alert("No pudimos acceder al micrófono. Verifica los permisos.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= 2) {
            stopRecording();
            return 3;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const togglePlay = (vn: VoiceNote) => {
    if (playingAudioId === vn.id && audioRef.current) {
      audioRef.current.pause();
      setPlayingAudioId(null);
    } else {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(vn.audioUrl);
      audio.onended = () => setPlayingAudioId(null);
      audio.play().catch((e) => {
         console.error(e);
         alert("Error al reproducir. Quizás el formato no es compatible o ocurrió un problema en caché.");
      });
      audioRef.current = audio;
      setPlayingAudioId(vn.id);
    }
  };

  const sortedPosts = [...posts].sort((a, b) => {
    if (activeTab === "trending")
      return b.likes - a.likes || b.createdAt - a.createdAt;
    return b.createdAt - a.createdAt;
  });

  const renderPostsList = (postsList: Post[]) => (
    <AnimatePresence mode="popLayout">
      {postsList.map((post) => {
        const isLiked = likedPosts.includes(post.id);
        const isOld = (getRealTime() - post.createdAt) / 60000 > 1;
        const isCorrupted = isOld && post.likes === 0 && glitchEffects;

        return (
          <motion.div
            key={post.id}
            layout={animationsEnabled}
            initial={
              animationsEnabled
                ? { opacity: 0, y: 15, scale: 0.98 }
                : { opacity: 1 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              animationsEnabled ? { opacity: 0, scale: 0.95 } : { opacity: 0 }
            }
            className="bg-white dark:bg-[#1F1C1A] border-2 border-black dark:border-[#4A3D31] border-l-4 sm:border-l-[6px] p-4 sm:p-5 flex flex-col gap-3 group relative shadow-[4px_4px_0_0_#000] dark:shadow-[4px_4px_0_0_#111]"
            style={{ borderLeftColor: post.authorColor }}
          >
            <div className="flex justify-between items-start">
              <button
                onClick={() =>
                  setViewingUser({ id: post.authorId, color: post.authorColor })
                }
                className="flex items-center gap-3 hover:opacity-80 transition-opacity text-left cursor-pointer"
              >
                <div className="w-8 h-8 sm:w-10 sm:h-10 border-2 border-black dark:border-[#4A3D31] bg-gray-50 dark:bg-[#1A1816] flex items-center justify-center">
                  <div
                    className="w-4 h-4 sm:w-5 sm:h-5"
                    style={{ backgroundColor: post.authorColor }}
                  ></div>
                </div>
                <div>
                  <span className="font-bold text-black dark:text-[#E0D8C8] text-lg sm:text-xl font-sans block leading-none hover:underline decoration-2 decoration-[#C85A17]">
                    {post.authorName || post.authorId}
                  </span>
                  <span className="text-[10px] sm:text-xs text-gray-500 dark:text-[#8A8174] uppercase tracking-wider block mt-1 font-mono">
                    {post.authorName ? post.authorId : "Verified"}
                  </span>
                </div>
              </button>
              <span className="text-xs sm:text-sm font-mono text-gray-500 dark:text-[#A89F90] font-bold border-2 border-black dark:border-[#4A3D31] px-2 py-1 bg-gray-100 dark:bg-[#25211D]">
                {new Date(post.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            <div className="flex flex-col">
              {post.replyToId && (
                <div className="flex items-center gap-2 mb-2 text-xs text-gray-500 dark:text-[#8A8174] uppercase font-bold tracking-widest border-b-2 border-dashed border-black dark:border-[#4A3D31] pb-1 font-serif">
                  <Repeat className="w-3 h-3 text-[#C85A17]" />
                  <span>{post.replyToAuthor}</span>
                </div>
              )}
              <div className="bg-gray-50 dark:bg-[#1A1816] p-3 sm:p-4 text-black dark:text-[#C1B7A5] text-xl sm:text-2xl leading-relaxed border-2 border-dashed border-gray-400 dark:border-[#3a3229] break-words font-serif whitespace-pre-wrap">
                <GlitchText
                  text={post.content}
                  isActive={isCorrupted}
                  enabled={glitchEffects}
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-1 flex-wrap gap-3">
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={() => handleLike(post.id)}
                  className={`flex items-center gap-1.5 sm:gap-2 border-2 px-2 sm:px-3 py-1 sm:py-1.5 transition-colors text-xs sm:text-sm font-bold uppercase tracking-wider font-sans cursor-pointer ${isLiked ? "border-[#C85A17] text-white bg-[#C85A17]" : "border-black dark:border-[#4A3D31] text-gray-700 dark:text-[#8A8174] hover:bg-gray-100 dark:hover:bg-[#2C2723]"}`}
                >
                  <Heart
                    className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isLiked ? "fill-white text-white" : ""}`}
                  />
                  <span>{post.likes}</span>
                </button>
                <button
                  onClick={() => handleReplyClick(post)}
                  className="flex items-center gap-1.5 sm:gap-2 border-2 border-black dark:border-[#4A3D31] text-gray-700 dark:text-[#8A8174] px-2 sm:px-3 py-1 sm:py-1.5 hover:bg-gray-100 dark:hover:bg-[#2C2723] transition-colors text-xs sm:text-sm font-bold uppercase font-sans cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                {ttsEnabled && (
                  <button
                    onClick={() => handleSpeak(post.content)}
                    className="flex items-center gap-1.5 sm:gap-2 border-2 border-black dark:border-[#4A3D31] text-gray-700 dark:text-[#8A8174] px-2 sm:px-3 py-1 sm:py-1.5 hover:bg-gray-100 dark:hover:bg-[#2C2723] transition-colors text-xs sm:text-sm font-bold uppercase font-sans cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                )}
              </div>
              {isCorrupted && (
                <div className="flex text-xs font-mono text-red-600 dark:text-red-500 uppercase font-bold tracking-widest items-center gap-1 sm:gap-2 border-2 border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-900/10 px-2 py-1">
                  <Activity className="w-3 h-3" />
                  <span>Señal Débil</span>
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
      {postsList.length === 0 && (
        <div className="text-center py-16 text-gray-500 dark:text-[#8A8174] text-xl border-2 border-dashed border-black dark:border-[#4A3D31] bg-white dark:bg-[#1F1C1A] font-serif tracking-widest shadow-[4px_4px_0_0_#000] dark:shadow-[4px_4px_0_0_#111]">
          Cinta magnética vacía.
        </div>
      )}
    </AnimatePresence>
  );

  const renderContent = () => {
    if (viewingUser) {
      const userPosts = posts
        .filter((p) => p.authorId === viewingUser.id)
        .sort((a, b) => b.createdAt - a.createdAt);
      const totalLikes = userPosts.reduce((sum, p) => sum + p.likes, 0);
      const isOnline = isUserOnline(viewingUser.id);

      return (
        <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto pb-10">
          <div className="bg-[#EBE7DF] dark:bg-[#1F1C1A] border-2 border-black dark:border-[#4A3D31] p-4 sm:p-8 shadow-[4px_4px_0_0_#000] dark:shadow-[4px_4px_0_0_#111]">
            <div className="flex items-start justify-between border-b-2 border-dashed border-black dark:border-[#4A3D31] pb-6 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 border-2 border-black dark:border-[#4A3D31] bg-gray-100 dark:bg-[#1A1816] flex items-center justify-center relative">
                  <div
                    className="w-8 h-8"
                    style={{ backgroundColor: viewingUser.color }}
                  ></div>
                  <div
                    className={`absolute -bottom-1 -right-1 w-4 h-4 border-2 border-black dark:border-[#4A3D31] rounded-full ${isOnline ? "bg-green-500" : "bg-gray-500"}`}
                  ></div>
                </div>
                <div>
                  <h2 className="text-3xl font-serif font-bold text-black dark:text-[#E0D8C8] tracking-widest">
                    {viewingUser.name || formatId(viewingUser.id)}{" "}
                    {viewingUser.name && (
                      <span className="text-sm text-gray-500">
                        ({formatId(viewingUser.id)})
                      </span>
                    )}
                  </h2>
                  <span className="text-sm font-mono text-gray-500 tracking-widest uppercase">
                    Perfil del Operador -{" "}
                    {isOnline ? "En línea" : "Desconectado"}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                {currentUser && currentUser.id !== viewingUser.id && (
                  <button
                    onClick={() => {
                      setActiveTab("chat");
                      setActiveChatId(viewingUser.id);
                      setViewingUser(null);
                    }}
                    className="p-2 border-2 border-black dark:border-[#4A3D31] hover:bg-[#C85A17] hover:text-white dark:hover:bg-[#C85A17] hover:border-[#C85A17] transition-colors cursor-pointer text-gray-600 border-transparent dark:text-gray-400"
                  >
                    <Mail className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={() => setViewingUser(null)}
                  className="p-2 border-2 border-black dark:border-[#4A3D31] hover:bg-black hover:text-white dark:hover:bg-[#C85A17] hover:border-[#C85A17] transition-colors cursor-pointer text-gray-600 border-transparent dark:text-gray-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-[#25211D] border-2 border-black dark:border-[#4A3D31] p-4 shadow-[2px_2px_0_0_#000] dark:shadow-[2px_2px_0_0_#111]">
                <div className="text-sm font-mono text-gray-500 dark:text-[#8A8174] uppercase tracking-widest mb-1">
                  Señales Emitidas
                </div>
                <div className="text-3xl font-bold font-serif text-black dark:text-[#E0D8C8]">
                  {userPosts.length}
                </div>
              </div>
              <div className="bg-white dark:bg-[#25211D] border-2 border-black dark:border-[#4A3D31] p-4 shadow-[2px_2px_0_0_#000] dark:shadow-[2px_2px_0_0_#111]">
                <div className="text-sm font-mono text-gray-500 dark:text-[#8A8174] uppercase tracking-widest mb-1">
                  Aprecios Recibidos
                </div>
                <div className="text-3xl font-bold font-serif text-[#C85A17]">
                  {totalLikes} ❤
                </div>
              </div>
            </div>
          </div>

          <h3 className="text-xl font-bold font-serif uppercase tracking-widest text-black dark:text-[#E0D8C8] px-2 flex items-center gap-2 mt-2 border-b-2 border-dashed border-black dark:border-[#4A3D31] pb-2">
            <Clock className="w-5 h-5 text-[#C85A17]" /> Historial de
            Transmisiones
          </h3>

          <section className="flex flex-col gap-6">
            {renderPostsList(userPosts)}
          </section>
        </div>
      );
    }

    if (activeTab === "chat") {
      if (activeChatId) {
        const chatMessages = messages
          .filter(
            (m) =>
              (m.fromId === currentUser?.id && m.toId === activeChatId) ||
              (m.fromId === activeChatId && m.toId === currentUser?.id),
          )
          .sort((a, b) => a.createdAt - b.createdAt);
        const contactMessage = chatMessages.find(
          (m) => m.fromId === activeChatId,
        );
        const contactName = contactMessage?.fromName || activeChatId;

        return (
          <div className="flex flex-col gap-4 w-full max-w-2xl mx-auto h-[65vh] sm:h-[calc(100vh-160px)]">
            <div className="flex items-center gap-3 bg-white dark:bg-[#1F1C1A] border-2 border-black dark:border-[#4A3D31] p-3 shadow-[4px_4px_0_0_#000] dark:shadow-[4px_4px_0_0_#111] shrink-0">
              <button
                onClick={() => setActiveChatId(null)}
                className="p-2 border-2 border-transparent hover:border-black dark:hover:border-[#4A3D31] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <h2 className="font-bold text-xl font-serif text-black dark:text-[#E0D8C8]">
                Contacto: {contactName}
              </h2>
              <div
                className={`w-3 h-3 border-2 border-black rounded-full ml-auto ${isUserOnline(activeChatId) ? "bg-green-500" : "bg-gray-500"}`}
              ></div>
            </div>

            <div className="flex-1 overflow-y-auto border-2 border-black dark:border-[#4A3D31] bg-gray-50 dark:bg-[#25211D] p-4 flex flex-col gap-3 hide-scroll">
              {chatMessages.length === 0 ? (
                <div className="text-center mt-10 text-gray-500 font-mono text-sm">
                  Sin mensajes previos. Emite tu señal.
                </div>
              ) : (
                chatMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] p-3 border-2 shadow-[2px_2px_0_#000] dark:shadow-[2px_2px_0_#111] ${m.fromId === currentUser?.id ? "self-end bg-white dark:bg-[#1A1816] border-black dark:border-[#4A3D31]" : "self-start bg-[#EBE7DF] dark:bg-[#2C2723] border-[#C85A17] dark:border-[#C85A17]"}`}
                  >
                    <div className="flex justify-between items-center gap-4 text-[10px] font-mono text-gray-500 mb-1">
                      <span>
                        {m.fromId === currentUser?.id
                          ? "Tú"
                          : m.fromName || m.fromId}
                      </span>
                      <span>
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="font-sans font-bold text-black dark:text-[#E0D8C8] break-words">
                      {m.content}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatBottomRef} />
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!chatInput.trim() || chatInput.length > 50 || !currentUser)
                  return;
                const newMsgId = Math.random().toString(36).substr(2, 9);
                const newMsg: PrivateMessage = {
                  id: newMsgId,
                  fromId: currentUser.id,
                  fromName: currentUser.name,
                  fromColor: currentUser.color,
                  toId: activeChatId,
                  content: chatInput.trim(),
                  createdAt: getRealTime(),
                  read: false,
                };
                try {
                  await setDoc(doc(db, 'messages', newMsgId), newMsg);
                  setChatInput("");
                  setTimeout(
                    () =>
                      chatBottomRef.current?.scrollIntoView({
                        behavior: "smooth",
                      }),
                    100,
                  );
                } catch (err) {
                  handleFirestoreError(err, OperationType.CREATE, 'messages');
                }
              }}
              className="flex gap-2 shrink-0"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Max 50 chars..."
                className="flex-1 border-2 border-black dark:border-[#4A3D31] p-3 text-lg bg-white dark:bg-[#1F1C1A] text-black dark:text-white font-sans outline-none focus:ring-2 focus:ring-[#C85A17]"
                maxLength={50}
              />
              <button
                disabled={!chatInput.trim()}
                className="px-5 bg-black text-white dark:bg-[#E0D8C8] dark:text-black border-2 border-black dark:border-[#E0D8C8] font-bold uppercase tracking-widest disabled:opacity-50 cursor-pointer hover:bg-[#C85A17] transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        );
      } else {
        const convos = new Map<string, string>(); // mapped from id to name
        messages.forEach((m) => {
          if (m.fromId === currentUser?.id) convos.set(m.toId, m.toId); // fallback
          if (m.toId === currentUser?.id)
            convos.set(m.fromId, m.fromName || m.fromId);
        });

        return (
          <div className="flex flex-col gap-4 w-full max-w-2xl mx-auto pb-10">
            <h2 className="text-3xl font-serif font-bold uppercase tracking-widest text-black dark:text-[#E0D8C8] border-b-2 border-dashed border-black dark:border-[#4A3D31] pb-4 mb-2 flex items-center gap-3">
              <Mail className="w-8 h-8 text-[#C85A17]" />
              Transmisiones Privadas
            </h2>
            {convos.size === 0 ? (
              <div className="text-center py-10 font-sans text-gray-500 border-2 border-dashed border-gray-400 p-6 bg-white dark:bg-[#1A1816]">
                Bandeja vacía. Abre el perfil de otro operador para enviar
                mensajes.
              </div>
            ) : (
              Array.from(convos.entries()).map(([id, name]) => (
                <button
                  key={id}
                  onClick={() => setActiveChatId(id)}
                  className="flex items-center gap-4 p-4 border-2 border-black dark:border-[#4A3D31] bg-white dark:bg-[#1A1816] hover:bg-gray-100 dark:hover:bg-[#2C2723] text-left transition-colors cursor-pointer group shadow-[4px_4px_0_0_#000] dark:shadow-[4px_4px_0_0_#111]"
                >
                  <div className="w-12 h-12 border-2 border-black dark:border-[#4A3D31] bg-gray-50 dark:bg-[#25211D] flex items-center justify-center relative shrink-0">
                    <UserIcon className="w-6 h-6 text-gray-500" />
                    <div
                      className={`absolute -bottom-1 -right-1 w-4 h-4 border-2 border-black dark:border-[#4A3D31] rounded-full z-10 ${isUserOnline(id) ? "bg-green-500" : "bg-gray-500"}`}
                    ></div>
                  </div>
                  <div className="flex-1">
                    <div className="font-bold font-serif text-xl text-black dark:text-white group-hover:text-[#C85A17] transition-colors">
                      {name}
                    </div>
                    <div className="text-sm font-mono text-gray-500">
                      Tocar para abrir conexión
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        );
      }
    }

    if (activeTab === "voice") {
      return (
        <div className="flex flex-col gap-4 w-full max-w-2xl mx-auto pb-10">
          <h2 className="text-3xl font-serif font-bold uppercase tracking-widest text-black dark:text-[#E0D8C8] border-b-2 border-dashed border-black dark:border-[#4A3D31] pb-4 mb-2 flex items-center gap-3">
            <Mic className="w-8 h-8 text-[#C85A17]" />
            Transmisiones de Voz
          </h2>
          <p className="font-mono text-sm text-gray-500 mb-2">
            Máximo 3 segundos. Límite de 10 voces por día.
          </p>
          <div className="flex justify-center mb-6 mt-4">
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              className={`w-24 h-24 rounded-full border-4 flex items-center justify-center transition-all cursor-pointer ${
                isRecording
                  ? "bg-red-500 border-red-700 animate-pulse scale-110 shadow-[0_0_20px_rgba(239,68,68,0.6)]"
                  : "bg-white dark:bg-[#1A1816] border-black dark:border-[#4A3D31] hover:border-[#C85A17] hover:scale-105 shadow-[4px_4px_0_0_#000] dark:shadow-[4px_4px_0_0_#111]"
              }`}
            >
              {isRecording ? (
                <span className="font-mono font-bold text-white text-xl">{recordingTime}s</span>
              ) : (
                <Mic className="w-10 h-10 text-black dark:text-[#E0D8C8]" />
              )}
            </button>
          </div>
          
          <div className="flex flex-col gap-4 mt-6">
            {voiceNotes.length === 0 ? (
              <div className="text-center py-10 font-sans text-gray-500 border-2 border-dashed border-gray-400 p-6 bg-white dark:bg-[#1A1816]">
                Ninguna transmisión de voz encontrada.
              </div>
            ) : (
              voiceNotes.map(vn => (
                <div key={vn.id} className="p-4 border-2 border-black dark:border-[#4A3D31] bg-white dark:bg-[#1A1816] flex items-center gap-4 shadow-[4px_4px_0_0_#000] dark:shadow-[4px_4px_0_0_#111]">
                  <div className="w-12 h-12 flex items-center justify-center border-2 border-black dark:border-[#4A3D31] bg-gray-100 dark:bg-[#25211D]">
                    <div className="w-4 h-4" style={{ backgroundColor: vn.authorColor }}></div>
                  </div>
                  <div className="flex-1">
                    <div className="font-bold font-serif text-black dark:text-[#E0D8C8]">{vn.authorName || vn.authorId}</div>
                    <div className="text-[10px] font-mono text-gray-500">{new Date(vn.createdAt).toLocaleTimeString()}</div>
                  </div>
                  <button onClick={() => togglePlay(vn)} className="w-10 h-10 border-2 border-black dark:border-[#4A3D31] flex items-center justify-center hover:bg-[#C85A17] hover:text-white transition-colors cursor-pointer dark:text-[#E0D8C8]">
                    {playingAudioId === vn.id ? <Square className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    if (activeTab === "ranking") {
      return (
        <div className="bg-[#EBE7DF] dark:bg-[#1F1C1A] border-2 border-black dark:border-[#4A3D31] p-4 sm:p-8 shadow-[4px_4px_0_0_#000] dark:shadow-[4px_4px_0_0_#111] w-full max-w-2xl mx-auto mb-10">
          <h2 className="text-3xl font-serif font-bold uppercase tracking-widest text-black dark:text-[#E0D8C8] border-b-2 border-dashed border-black dark:border-[#4A3D31] pb-4 flex items-center gap-3">
            <Trophy className="w-8 h-8 text-[#C85A17]" />
            Escalafón Global
          </h2>
          <div className="flex gap-2 mb-6 mt-4">
            <button
              onClick={() => setRankingSort("count")}
              className={`px-3 py-1.5 font-mono text-xs sm:text-sm uppercase font-bold border-2 transition-colors cursor-pointer ${rankingSort === "count" ? "border-[#C85A17] bg-[#C85A17] text-white shadow-[2px_2px_0_0_#000] dark:shadow-[2px_2px_0_0_#111]" : "border-black bg-white dark:border-[#4A3D31] dark:bg-[#1A1816] text-gray-600 dark:text-[#8A8174]"}`}
            >
              Transmisiones
            </button>
            <button
              onClick={() => setRankingSort("likes")}
              className={`px-3 py-1.5 font-mono text-xs sm:text-sm uppercase font-bold border-2 transition-colors cursor-pointer ${rankingSort === "likes" ? "border-[#C85A17] bg-[#C85A17] text-white shadow-[2px_2px_0_0_#000] dark:shadow-[2px_2px_0_0_#111]" : "border-black bg-white dark:border-[#4A3D31] dark:bg-[#1A1816] text-gray-600 dark:text-[#8A8174]"}`}
            >
              Aprecios
            </button>
          </div>
          <div className="flex flex-col gap-4">
            {getRanking().length === 0 ? (
              <div className="text-center py-10 font-sans text-gray-500 dark:text-[#8A8174] border-2 border-dashed border-gray-400 dark:border-[#4A3D31]">
                Sin datos suficientes.
              </div>
            ) : (
              getRanking().map((user) => (
                <div
                  key={user.id}
                  className={`flex items-center justify-between p-4 border-2 ${user.rank === 1 ? "border-[#C85A17] bg-[#C85A17]/10" : "border-black dark:border-[#4A3D31] bg-white dark:bg-[#1A1816]"}`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`text-2xl font-serif font-bold ${user.rank === 1 ? "text-[#C85A17]" : "text-gray-500 dark:text-[#8A8174]"}`}
                    >
                      #{user.rank}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 border-2 border-black dark:border-[#4A3D31] flex items-center justify-center bg-gray-100 dark:bg-[#1A1816]">
                        <div
                          className="w-4 h-4"
                          style={{ backgroundColor: user.color }}
                        ></div>
                      </div>
                      <span className="font-sans font-bold text-black dark:text-[#E0D8C8] text-lg sm:text-xl tracking-wider">
                        {formatId(user.id)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 sm:gap-6 text-sm sm:text-base font-serif font-bold text-gray-600 dark:text-[#A89F90]">
                    <div className="flex flex-col items-end">
                      <span className="uppercase text-[10px] sm:text-xs font-sans tracking-widest text-gray-500 dark:text-[#8A8174]">
                        Transmisiones
                      </span>
                      <span>{user.count}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="uppercase text-[10px] sm:text-xs font-sans tracking-widest text-gray-500 dark:text-[#8A8174]">
                        Aprecios
                      </span>
                      <span className="text-[#C85A17]">{user.likes} ❤</span>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setViewingUser({ id: user.id, color: user.color })
                    }
                    className="ml-2 p-2 border-2 border-transparent hover:border-black dark:hover:border-[#4A3D31] text-gray-400 hover:text-[#C85A17] transition-all cursor-pointer"
                  >
                    <UserIcon className="w-5 h-5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-6 w-full max-w-2xl mx-auto pb-10">
        {activeTab === "latest" && (
          <div className="border-2 border-black dark:border-[#4A3D31] p-4 sm:p-5 bg-[#EBE7DF] dark:bg-[#25211D] shadow-[4px_4px_0_0_#000] dark:shadow-[4px_4px_0_0_#111] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-[#C85A17]/10 dark:bg-[#C85A17]/5 -translate-y-1/2 translate-x-1/2 rounded-full blur-xl"></div>
            <div className="flex items-center justify-between mb-3 relative z-10">
              <div className="flex items-center gap-2 text-[#C85A17]">
                <Radio className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
                <span className="uppercase tracking-widest font-bold text-xs sm:text-sm font-sans flex-1">
                  Señal Foránea
                </span>
              </div>
              <button
                onClick={fetchTransmission}
                className="text-[10px] font-mono border-2 border-black dark:border-[#4A3D31] bg-white dark:bg-[#1A1816] px-2 py-1 hover:bg-[#C85A17] hover:text-white dark:hover:bg-[#C85A17] hover:border-[#C85A17] transition-all cursor-pointer font-bold uppercase text-gray-600 dark:text-[#E0D8C8] shadow-[2px_2px_0_0_#000] dark:shadow-[2px_2px_0_0_#111] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none"
              >
                Interceptar
              </button>
            </div>
            <p className="font-serif text-black dark:text-[#C1B7A5] italic leading-relaxed text-sm sm:text-base border-l-4 border-[#C85A17] pl-3">
              "{encryptedMessage || "Buscando frecuencias en el vacío..."}"
            </p>
          </div>
        )}

        <section className="bg-white dark:bg-[#24211D] border-2 border-black dark:border-[#4A3D31] p-1 shadow-[4px_4px_0_0_#000] dark:shadow-[4px_4px_0_0_#111]">
          <div className="border-2 border-dashed border-black dark:border-[#4A3D31] p-0 flex flex-col">
            {replyTo && (
              <div className="bg-gray-100 dark:bg-[#2C2723] border-b-2 border-dashed border-black dark:border-[#4A3D31] p-3 flex justify-between items-center text-sm font-serif font-bold uppercase tracking-widest text-black dark:text-[#E0D8C8]">
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-[#C85A17]" />
                  <span>Respondiendo a {replyTo.authorId}</span>
                </div>
                <button
                  onClick={() => setReplyTo(null)}
                  className="text-gray-500 hover:text-red-500 dark:text-[#8A8174] dark:hover:text-red-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <form onSubmit={handlePost} className="p-4 sm:p-5 flex flex-col">
              <textarea
                ref={composeRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Escribe tu telegrama aquí..."
                className="w-full bg-transparent border-none resize-none text-xl sm:text-2xl focus:ring-0 outline-none placeholder:text-gray-400 dark:placeholder:text-[#6a6358] h-24 sm:h-28 hide-scroll leading-relaxed font-sans"
              />
              <div className="flex justify-between items-center mt-3 pt-3 border-t-2 border-dashed border-black dark:border-[#4A3D31]">
                <span
                  className={`text-sm sm:text-lg font-mono font-bold px-2 sm:px-3 py-1 border-2 ${isOverLimit ? "text-red-500 border-red-500 bg-red-50 dark:bg-red-900/10" : "text-gray-600 border-black bg-gray-50 dark:text-[#8A8174] dark:border-[#4A3D31] dark:bg-[#1A1816]"}`}
                >
                  {content.length} / {MAX_CHARS}
                </span>
                <button
                  type="submit"
                  disabled={!content.trim() || isOverLimit}
                  className="px-4 sm:px-6 py-2 bg-black text-white dark:bg-[#E0D8C8] dark:text-[#1A1816] disabled:opacity-50 font-bold text-sm sm:text-base tracking-widest uppercase flex items-center gap-2 hover:bg-[#C85A17] dark:hover:bg-[#C85A17] hover:text-white transition-colors border-2 border-transparent"
                >
                  <Send className="w-4 h-4" />
                  <span>Emitir</span>
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          {renderPostsList(sortedPosts)}
        </section>
      </div>
    );
  };

  if (!authInitialized) {
    return (
      <div className={theme === "dark" ? "dark flex items-center justify-center min-h-[100dvh] bg-[#1A1816] text-[#E0D8C8]" : "flex items-center justify-center min-h-[100dvh] bg-[#EBE7DF] text-black"}>
        <div className="text-xl font-mono uppercase tracking-widest animate-pulse border-2 border-black dark:border-[#4A3D31] p-4">Iniciando...</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className={theme === "dark" ? "dark min-h-[100dvh] bg-[#1A1816] flex items-center justify-center font-sans relative overflow-hidden" : "min-h-[100dvh] bg-[#EBE7DF] flex items-center justify-center font-sans relative overflow-hidden"}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(#C85A17 1px, transparent 1px)", backgroundSize: "20px 20px" }}></div>
        <div className="max-w-md w-full mx-4 p-8 bg-white dark:bg-[#1A1816] border-[4px] border-black dark:border-[#4A3D31] shadow-[8px_8px_0_0_#000] dark:shadow-[8px_8px_0_0_#111] rotate-1 z-10">
          <h1 className="text-5xl font-serif font-black uppercase tracking-widest text-black dark:text-[#E0D8C8] -rotate-2 mb-2">MicroVox</h1>
          <p className="text-gray-500 dark:text-[#8A8174] font-mono text-sm tracking-widest border-b-2 border-dashed border-black dark:border-[#4A3D31] pb-4 mb-8">Red de señales cortas.</p>
          
          <button 
             onClick={() => signInWithPopup(auth, new GoogleAuthProvider()).catch(console.error)}
             className="w-full py-4 bg-black text-white dark:bg-[#E0D8C8] dark:text-[#1A1816] font-bold text-lg uppercase tracking-widest hover:bg-[#C85A17] dark:hover:bg-[#C85A17] hover:text-white transition-colors border-2 border-black dark:border-[#4A3D31] shadow-[4px_4px_0_0_#000] dark:shadow-[4px_4px_0_0_#111] hover:translate-x-1 hover:translate-y-1 hover:shadow-[2px_2px_0_0_#000] cursor-pointer flex items-center justify-center gap-3"
          >
            <UserIcon className="w-6 h-6" />
            Entrar al Bucle
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        theme === "dark"
          ? "dark h-[100dvh] w-full flex overflow-hidden font-sans bg-transparent"
          : "h-[100dvh] w-full flex overflow-hidden font-sans bg-transparent"
      }
    >
      {/* Desktop Sidebar */}
      <aside className="w-72 border-r-[3px] border-[#1A1816] dark:border-[#4A3D31] p-6 flex-col gap-6 bg-[#EBE7DF] dark:bg-[#1F1C1A] shrink-0 hidden md:flex z-20 shadow-xl">
        <div className="border-b-2 border-dashed border-black dark:border-[#4A3D31] pb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#C85A17] border-2 border-black dark:border-[#E0D8C8] shadow-[4px_4px_0_rgba(26,24,22,1)] dark:shadow-[4px_4px_0_rgba(200,90,23,0.3)] flex items-center justify-center">
              <Radio className="w-5 h-5 text-white dark:text-[#E0D8C8]" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-black dark:text-[#E0D8C8] font-serif uppercase">
              MicroVox
            </h1>
          </div>
          <div className="text-xs font-mono font-bold uppercase text-gray-600 dark:text-gray-400 mt-2">
            La red retrofuturista
          </div>
        </div>

        <nav className="flex flex-col gap-3 mt-2 font-sans font-bold">
          <button
            onClick={() => handleTabChange("latest")}
            className={`p-3 flex items-center gap-3 transition-colors border-2 cursor-pointer ${activeTab === "latest" ? "bg-white dark:bg-[#2C2723] border-black dark:border-[#4A3D31] text-black dark:text-[#E0D8C8] shadow-[4px_4px_0_#000] dark:shadow-[4px_4px_0_#111]" : "border-transparent text-gray-600 dark:text-[#8A8174] hover:border-gray-400 dark:hover:border-[#4A3D31]"}`}
          >
            <Clock className="w-5 h-5" />{" "}
            <span className="uppercase tracking-widest text-sm">General</span>
            {activeTab === "latest" && (
              <div className="ml-auto w-2 h-2 bg-[#C85A17] animate-pulse"></div>
            )}
          </button>

          <button
            onClick={() => handleTabChange("trending")}
            className={`p-3 flex items-center gap-3 transition-colors border-2 cursor-pointer ${activeTab === "trending" ? "bg-white dark:bg-[#2C2723] border-black dark:border-[#4A3D31] text-black dark:text-[#E0D8C8] shadow-[4px_4px_0_#000] dark:shadow-[4px_4px_0_#111]" : "border-transparent text-gray-600 dark:text-[#8A8174] hover:border-gray-400 dark:hover:border-[#4A3D31]"}`}
          >
            <Flame className="w-5 h-5" />{" "}
            <span className="uppercase tracking-widest text-sm">
              Tendencias
            </span>
            {activeTab === "trending" && (
              <div className="ml-auto w-2 h-2 bg-[#C85A17] animate-pulse"></div>
            )}
          </button>

          <button
            onClick={() => handleTabChange("ranking")}
            className={`p-3 flex items-center gap-3 transition-colors border-2 cursor-pointer ${activeTab === "ranking" ? "bg-white dark:bg-[#2C2723] border-black dark:border-[#4A3D31] text-black dark:text-[#E0D8C8] shadow-[4px_4px_0_#000] dark:shadow-[4px_4px_0_#111]" : "border-transparent text-gray-600 dark:text-[#8A8174] hover:border-gray-400 dark:hover:border-[#4A3D31]"}`}
          >
            <Trophy className="w-5 h-5" />{" "}
            <span className="uppercase tracking-widest text-sm">Ranking</span>
            {activeTab === "ranking" && (
              <div className="ml-auto w-2 h-2 bg-[#C85A17] animate-pulse"></div>
            )}
          </button>

          <button
            onClick={() => {
              handleTabChange("chat");
              setActiveChatId(null);
            }}
            className={`p-3 flex items-center gap-3 transition-colors border-2 cursor-pointer ${activeTab === "chat" ? "bg-white dark:bg-[#2C2723] border-black dark:border-[#4A3D31] text-black dark:text-[#E0D8C8] shadow-[4px_4px_0_#000] dark:shadow-[4px_4px_0_#111]" : "border-transparent text-gray-600 dark:text-[#8A8174] hover:border-gray-400 dark:hover:border-[#4A3D31]"}`}
          >
            <Mail className="w-5 h-5" />{" "}
            <span className="uppercase tracking-widest text-sm">Mensajes</span>
            {activeTab === "chat" && (
              <div className="ml-auto w-2 h-2 bg-[#C85A17] animate-pulse"></div>
            )}
          </button>

          <button
            onClick={() => handleTabChange("voice")}
            className={`p-3 flex items-center gap-3 transition-colors border-2 cursor-pointer ${activeTab === "voice" ? "bg-white dark:bg-[#2C2723] border-black dark:border-[#4A3D31] text-black dark:text-[#E0D8C8] shadow-[4px_4px_0_#000] dark:shadow-[4px_4px_0_#111]" : "border-transparent text-gray-600 dark:text-[#8A8174] hover:border-gray-400 dark:hover:border-[#4A3D31]"}`}
          >
            <Mic className="w-5 h-5" />{" "}
            <span className="uppercase tracking-widest text-sm">Voz</span>
            {activeTab === "voice" && (
              <div className="ml-auto w-2 h-2 bg-[#C85A17] animate-pulse"></div>
            )}
          </button>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col h-[100dvh] overflow-hidden relative z-10 w-full">
        {/* Header */}
        <header className="h-[60px] sm:h-[70px] border-b-[3px] border-black dark:border-[#4A3D31] bg-[#EBE7DF] dark:bg-[#1F1C1A] flex items-center justify-between px-4 sm:px-8 shrink-0 z-20">
          <div className="flex items-center gap-3">
            <div className="md:hidden flex items-center gap-2">
              <div className="w-8 h-8 bg-[#C85A17] border-2 border-black dark:border-[#E0D8C8] flex items-center justify-center">
                <Radio className="w-4 h-4 text-white dark:text-[#E0D8C8]" />
              </div>
              <h1 className="text-xl font-bold tracking-tight font-serif uppercase text-black dark:text-white">
                MVX
              </h1>
            </div>
            <div className="hidden md:flex items-center gap-2 border-2 border-black dark:border-[#4A3D31] px-3 py-1 bg-white dark:bg-[#1A1816]">
              <Globe2 className="w-4 h-4 text-[#C85A17]" />
              <span className="text-sm font-sans font-bold text-gray-700 dark:text-[#8A8174] uppercase tracking-wider">
                {posts.length} TX
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {currentUser && (
              <div className="flex items-center gap-2 border-2 border-black dark:border-[#4A3D31] px-2 py-1 bg-white dark:bg-[#2C2723]">
                <div
                  className="w-3 h-3 sm:w-4 sm:h-4 border border-black dark:border-white/20"
                  style={{ backgroundColor: currentUser.color }}
                ></div>
                <span className="text-xs sm:text-sm font-mono font-bold text-black dark:text-[#E0D8C8] tracking-widest">
                  {formatId(currentUser.id)}
                </span>
              </div>
            )}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 border-2 border-black dark:border-[#4A3D31] hover:bg-gray-200 dark:hover:bg-[#C85A17]/10 transition-colors bg-white dark:bg-[#1A1816] shadow-[2px_2px_0_#000] dark:shadow-[2px_2px_0_#4A3D31]"
            >
              <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-black dark:text-[#E0D8C8]" />
            </button>
          </div>
        </header>

        {/* Swipeable View Container */}
        <div className="flex-1 overflow-hidden relative bg-[#EBE7DF] dark:bg-[#1A1816]">
          {animationsEnabled ? (
            <AnimatePresence initial={false} custom={direction}>
              <motion.div
                key={activeTab}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 },
                }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                onDragEnd={(e, { offset, velocity }) => {
                  const swipe = Math.abs(offset.x) * velocity.x;
                  if (swipe < -1000) {
                    const next =
                      activeTab === "latest"
                        ? "trending"
                        : activeTab === "trending"
                          ? "ranking"
                          : activeTab === "ranking"
                            ? "chat"
                            : activeTab === "chat"
                              ? "voice"
                              : null;
                    if (next) handleTabChange(next);
                  } else if (swipe > 1000) {
                    const prev =
                      activeTab === "voice"
                        ? "chat"
                        : activeTab === "chat"
                          ? "ranking"
                          : activeTab === "ranking"
                            ? "trending"
                            : activeTab === "trending"
                              ? "latest"
                              : null;
                    if (prev) handleTabChange(prev);
                  }
                }}
                className="absolute inset-0 overflow-y-auto px-4 sm:px-8 pt-6 sm:pt-8 pb-24 sm:pb-12 hide-scroll"
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="absolute inset-0 overflow-y-auto px-4 sm:px-8 pt-6 sm:pt-8 pb-24 sm:pb-12 hide-scroll">
              {renderContent()}
            </div>
          )}
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#EBE7DF] dark:bg-[#1F1C1A] border-t-[3px] border-black dark:border-[#4A3D31] flex z-30 font-sans">
          <button
            onClick={() => handleTabChange("latest")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 border-r-[2px] border-black dark:border-[#4A3D31] ${activeTab === "latest" ? "text-black bg-white dark:text-[#C85A17] dark:bg-[#C85A17]/10" : "text-gray-600 bg-transparent dark:text-[#8A8174]"}`}
          >
            <Clock className="w-5 h-5" />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              Feed
            </span>
          </button>
          <button
            onClick={() => handleTabChange("trending")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 border-r-[2px] border-black dark:border-[#4A3D31] ${activeTab === "trending" ? "text-black bg-white dark:text-[#C85A17] dark:bg-[#C85A17]/10" : "text-gray-600 bg-transparent dark:text-[#8A8174]"}`}
          >
            <Flame className="w-5 h-5" />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              Hot
            </span>
          </button>
          <button
            onClick={() => handleTabChange("ranking")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 border-r-[2px] border-black dark:border-[#4A3D31] ${activeTab === "ranking" ? "text-black bg-white dark:text-[#C85A17] dark:bg-[#C85A17]/10" : "text-gray-600 bg-transparent dark:text-[#8A8174]"}`}
          >
            <Trophy className="w-5 h-5" />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              Rank
            </span>
          </button>
          <button
            onClick={() => {
              handleTabChange("chat");
              setActiveChatId(null);
            }}
            className={`flex-1 flex flex-col items-center justify-center gap-1 border-r-[2px] border-black dark:border-[#4A3D31] ${activeTab === "chat" ? "text-black bg-white dark:text-[#C85A17] dark:bg-[#C85A17]/10" : "text-gray-600 bg-transparent dark:text-[#8A8174]"}`}
          >
            <Mail className="w-5 h-5" />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              Chat
            </span>
          </button>
          <button
            onClick={() => handleTabChange("voice")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 ${activeTab === "voice" ? "text-black bg-white dark:text-[#C85A17] dark:bg-[#C85A17]/10" : "text-gray-600 bg-transparent dark:text-[#8A8174]"}`}
          >
            <Mic className="w-5 h-5" />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              Voz
            </span>
          </button>
        </nav>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 dark:bg-[#1A1816]/70 backdrop-blur-sm"
              onClick={() => setIsSettingsOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              className="bg-[#EBE7DF] dark:bg-[#1A1816] border-[3px] border-black dark:border-[#4A3D31] w-full max-w-lg relative z-10 shadow-[8px_8px_0_#000] dark:shadow-[6px_6px_0_#000]"
            >
              <div className="flex items-center justify-between border-b-[3px] border-black dark:border-[#4A3D31] p-4 bg-white dark:bg-[#1F1C1A]">
                <h2 className="text-xl sm:text-2xl font-bold font-serif tracking-widest uppercase text-black dark:text-[#E0D8C8]">
                  Panel de Control
                </h2>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1 border-2 border-black dark:border-[#4A3D31] hover:bg-[#C85A17] hover:text-white transition-colors text-black dark:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 flex flex-col gap-5 max-h-[80vh] overflow-y-auto hide-scroll">
                <div className="border-2 border-black dark:border-[#4A3D31] p-4 bg-white dark:bg-[#25211D]">
                  <h3 className="text-[#C85A17] uppercase tracking-widest font-bold mb-3 text-sm sm:text-base border-b-2 border-dashed border-black dark:border-[#4A3D31] pb-2 font-sans">
                    Identidad
                  </h3>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 border-2 border-black dark:border-[#4A3D31] bg-gray-100 dark:bg-[#1A1816] flex items-center justify-center">
                        <div
                          className="w-4 h-4 border border-black/20 dark:border-white/20"
                          style={{ backgroundColor: currentUser?.color }}
                        ></div>
                      </div>
                      <span className="text-xl font-mono font-bold text-black dark:text-[#E0D8C8]">
                        {currentUser ? formatId(currentUser.id) : ""}
                      </span>
                    </div>
                    <div>
                      <label className="text-xs uppercase font-bold tracking-widest mb-1 block text-gray-500">
                        Alias (opcional)
                      </label>
                      <input
                        type="text"
                        value={currentUser?.name || ""}
                        onChange={async (e) => {
                          if (currentUser) {
                            const newName = e.target.value;
                            setCurrentUser({ ...currentUser, name: newName });
                            try {
                               await updateDoc(doc(db, 'users', currentUser.id), { name: newName });
                            } catch(err) {
                               console.error(err);
                            }
                          }
                        }}
                        placeholder="Ingresa tu apodo..."
                        maxLength={20}
                        className="w-full border-2 border-black dark:border-[#4A3D31] p-2 bg-transparent dark:text-white font-serif outline-none focus:border-[#C85A17] transition-colors"
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => {
                          setIsSettingsOpen(false);
                          if (currentUser) {
                            setActiveTab("chat");
                            setViewingUser({
                              id: currentUser.id,
                              color: currentUser.color,
                              name: currentUser.name,
                            });
                          }
                        }}
                        className="flex-1 px-3 py-2 text-xs font-bold uppercase tracking-widest border-2 border-transparent hover:border-black dark:hover:border-[#4A3D31] text-gray-500 hover:text-[#C85A17] transition-colors cursor-pointer text-center"
                      >
                        Ver Perfil
                      </button>
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              "¿Cambiar identidad? Cuidado, perderás tu ID actual y tu historial de transmisiones no estará enlazado a ti.",
                            )
                          ) {
                            signOut(auth).catch(console.error);
                            if (viewingUser?.id === currentUser?.id)
                              setViewingUser(null);
                          }
                        }}
                        className="flex-1 px-3 py-2 text-xs font-bold uppercase tracking-widest border-2 border-black dark:border-[#4A3D31] hover:bg-black hover:text-white dark:hover:bg-[#E0D8C8] dark:hover:text-[#1A1816] transition-colors cursor-pointer text-black dark:text-white text-center"
                      >
                        Renovar
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border-2 border-black dark:border-[#4A3D31] p-4 bg-white dark:bg-[#25211D] flex flex-col gap-1 text-sm sm:text-base font-bold text-black dark:text-white font-sans">
                  <h3 className="text-[#C85A17] uppercase tracking-widest font-bold mb-2 text-sm sm:text-base border-b-2 border-dashed border-black dark:border-[#4A3D31] pb-2 font-sans">
                    Apariencia y Sistema
                  </h3>

                  <div className="flex items-center justify-between py-2 border-b border-dashed border-black dark:border-[#4A3D31]">
                    <span>Tema Visual</span>
                    <button
                      onClick={() =>
                        setTheme((t) => (t === "dark" ? "light" : "dark"))
                      }
                      className="flex items-center gap-2 px-3 py-1 border-2 border-black dark:border-[#4A3D31] hover:bg-gray-200 dark:hover:bg-[#2C2723] text-black dark:text-white"
                    >
                      {theme === "dark" ? (
                        <Moon className="w-4 h-4" />
                      ) : (
                        <Sun className="w-4 h-4" />
                      )}
                      <span className="uppercase text-xs tracking-widest">
                        {theme}
                      </span>
                    </button>
                  </div>

                  <label className="flex items-center justify-between cursor-pointer py-3 border-b border-dashed border-black dark:border-[#4A3D31]">
                    <span>Animaciones fluidas</span>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={animationsEnabled}
                      onChange={(e) => setAnimationsEnabled(e.target.checked)}
                    />
                    <div
                      className={`w-10 h-6 border-2 p-0.5 transition-colors ${animationsEnabled ? "border-[#C85A17] bg-[#C85A17]" : "border-gray-500 dark:border-[#4A3D31] bg-gray-300 dark:bg-[#1A1816]"}`}
                    >
                      <div
                        className={`w-4 h-4 bg-white transition-transform ${animationsEnabled ? "translate-x-4" : "translate-x-0"}`}
                      ></div>
                    </div>
                  </label>

                  <label className="flex items-center justify-between cursor-pointer py-3 border-b border-dashed border-black dark:border-[#4A3D31]">
                    <span>Señales Fantasma (Bots)</span>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={botsEnabled}
                      onChange={(e) => setBotsEnabled(e.target.checked)}
                    />
                    <div
                      className={`w-10 h-6 border-2 p-0.5 transition-colors ${botsEnabled ? "border-[#C85A17] bg-[#C85A17]" : "border-gray-500 dark:border-[#4A3D31] bg-gray-300 dark:bg-[#1A1816]"}`}
                    >
                      <div
                        className={`w-4 h-4 bg-white transition-transform ${botsEnabled ? "translate-x-4" : "translate-x-0"}`}
                      ></div>
                    </div>
                  </label>

                  <label className="flex items-center justify-between cursor-pointer py-3 border-b border-dashed border-black dark:border-[#4A3D31]">
                    <span>Síntesis de Voz (TTS)</span>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={ttsEnabled}
                      onChange={(e) => setTtsEnabled(e.target.checked)}
                    />
                    <div
                      className={`w-10 h-6 border-2 p-0.5 transition-colors ${ttsEnabled ? "border-[#C85A17] bg-[#C85A17]" : "border-gray-500 dark:border-[#4A3D31] bg-gray-300 dark:bg-[#1A1816]"}`}
                    >
                      <div
                        className={`w-4 h-4 bg-white transition-transform ${ttsEnabled ? "translate-x-4" : "translate-x-0"}`}
                      ></div>
                    </div>
                  </label>

                  <label className="flex items-center justify-between cursor-pointer py-3">
                    <span>Efectos Retro Glitch</span>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={glitchEffects}
                      onChange={(e) => setGlitchEffects(e.target.checked)}
                    />
                    <div
                      className={`w-10 h-6 border-2 p-0.5 transition-colors ${glitchEffects ? "border-[#C85A17] bg-[#C85A17]" : "border-gray-500 dark:border-[#4A3D31] bg-gray-300 dark:bg-[#1A1816]"}`}
                    >
                      <div
                        className={`w-4 h-4 bg-white transition-transform ${glitchEffects ? "translate-x-4" : "translate-x-0"}`}
                      ></div>
                    </div>
                  </label>
                </div>

                <div className="border-2 border-red-900/30 p-4 bg-red-50 dark:bg-red-900/10">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-red-600 dark:text-red-400 uppercase tracking-widest">
                      Purgar Datos
                    </span>
                    <button
                      onClick={handleClearData}
                      className="p-2 border-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
