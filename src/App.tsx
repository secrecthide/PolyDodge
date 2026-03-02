import React, { useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import nipplejs from 'nipplejs';
import { Target, Trophy, Heart, Shield, Users, Play, Info, Zap, Globe, Settings, HelpCircle, X, Palette, ShoppingCart, ChevronRight, ChevronLeft, Volume2, VolumeX, Smartphone, Monitor, Lock, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { io, Socket } from 'socket.io-client';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const joystickMoveContainerRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<'menu' | 'playing'>('menu');
  const [isMobile, setIsMobile] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isMouseLocked, setIsMouseLocked] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const joystickRef = useRef<any>(null);
  // Right joystick removed as per user request
  
  // Touch look refs
  const lookTouchId = useRef<number | null>(null);
  const lastLookTouch = useRef<{ x: number, y: number } | null>(null);
  
  // Multiplayer state
  const [socket, setSocket] = useState<Socket | null>(null);
  const [matchmakingState, setMatchmakingState] = useState<'none' | 'searching' | 'found'>('none');
  const [matchRoom, setMatchRoom] = useState<any>(null);
  const [matchType, setMatchType] = useState<'casual' | 'ranked'>('casual');

  const handleLookTouchStart = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      // If touch is on the right half of the screen and we're not already tracking a look touch
      if (touch.clientX > window.innerWidth / 2 && lookTouchId.current === null) {
        lookTouchId.current = touch.identifier;
        lastLookTouch.current = { x: touch.clientX, y: touch.clientY };
      }
    }
  };

  const handleLookTouchMove = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === lookTouchId.current && lastLookTouch.current) {
        const dx = touch.clientX - lastLookTouch.current.x;
        const dy = touch.clientY - lastLookTouch.current.y;
        
        if (gameRef.current) {
          gameRef.current.rotateCamera(dx, dy);
        }
        
        lastLookTouch.current = { x: touch.clientX, y: touch.clientY };
      }
    }
  };

  const handleLookTouchEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === lookTouchId.current) {
        lookTouchId.current = null;
        lastLookTouch.current = null;
      }
    }
  };

  useEffect(() => {
    const checkMobile = () => {
      const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      const isSmallScreen = window.innerWidth < 1024;
      const mobile = isTouch || isSmallScreen;
      setIsMobile(mobile);
      setIsLandscape(window.innerWidth > window.innerHeight);
      if (gameRef.current) {
        gameRef.current.setMobile(mobile);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);



  const [hudData, setHudData] = useState({
    score: 0,
    team: 'blue',
    holding: false,
    canPickUp: false,
    isOut: false,
    isAimingAtEnemy: false,
    winner: null as string | null,
    roundWinner: null as string | null,
    stamina: 100,
    chargeLevel: 0,
    isBlocking: false,
    timer: 180,
    bluePlayersLeft: 4,
    redPlayersLeft: 4,
    blueWins: 0,
    redWins: 0,
    matchState: 'playing' as 'warmup' | 'playing' | 'finished',
    killFeed: [] as any[],
    roundStartTimestamp: 0,
    scoreboard: null as any[] | null,
    playAgainVotes: [] as string[] | null,
    holdTime: 0,
    maxHoldTime: 10000
  });

  useEffect(() => {
    if (gameState === 'playing' && isMobile) {
      // Initialize movement joystick (Left) - Dynamic Mode
      const moveContainer = joystickMoveContainerRef.current;
      if (moveContainer) {
        // Clear any existing nipplejs instances in this container just in case
        while (moveContainer.firstChild) {
          moveContainer.removeChild(moveContainer.firstChild);
        }

        const manager = nipplejs.create({
          zone: moveContainer,
          mode: 'dynamic',
          color: 'white',
          size: 120,
          restOpacity: 0.5,
          threshold: 0.1,
          multitouch: true,
          maxNumberOfNipples: 1
        });

        manager.on('move', (evt, data) => {
          if (gameRef.current) {
            gameRef.current.setMobileMove(data.vector.x, data.vector.y);
          }
        });

        manager.on('end', () => {
          if (gameRef.current) {
            gameRef.current.setMobileMove(0, 0);
          }
        });

        joystickRef.current = manager;
      }
    }

    return () => {
      if (joystickRef.current) {
        joystickRef.current.destroy();
        joystickRef.current = null;
      }
    };
  }, [gameState, isMobile, isLandscape, hudData.isOut]);

  useEffect(() => {
    console.log("HUD Data Winner Changed:", hudData.winner);
    if (hudData.winner) {
      console.log("Winner declared:", hudData.winner);
      setShowGameEnd(true);
      
      setPlayerProfile(p => {
        const won = hudData.winner === hudData.team;
        const xpGain = won ? 50 : 20;
        const coinGain = won ? 100 : 30;
        let newXp = p.xp + xpGain;
        let newLevel = p.level;
        let newNextXp = p.nextXp;
        
        if (newXp >= p.nextXp) {
          newXp -= p.nextXp;
          newLevel++;
          newNextXp = Math.floor(p.nextXp * 1.2);
        }
        
        return {
          ...p,
          xp: newXp,
          level: newLevel,
          nextXp: newNextXp,
          coins: p.coins + coinGain
        };
      });
    }
  }, [hudData.winner]);

  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    let interval: any;
    if (hudData.roundStartTimestamp > 0) {
      interval = setInterval(() => {
        const remaining = Math.ceil((hudData.roundStartTimestamp - Date.now()) / 1000);
        if (remaining <= 0) {
          setCountdown(0);
          // Don't clear timestamp here, let next update handle it or just ignore if <= 0
        } else {
          setCountdown(remaining);
        }
      }, 100);
    } else {
      setCountdown(0);
    }
    return () => clearInterval(interval);
  }, [hudData.roundStartTimestamp]);

  // Profile & Customization State
  const [playerProfile, setPlayerProfile] = useState(() => {
    const saved = localStorage.getItem('polyDodge_profile');
    if (saved) return JSON.parse(saved);
    return {
      username: 'Player',
      level: 1,
      xp: 0,
      nextXp: 100,
      rank: 'Bronze I',
      coins: 0,
      gems: 0
    };
  });

  const [unlockedItems, setUnlockedItems] = useState<string[]>(() => {
    const saved = localStorage.getItem('polyDodge_unlocked');
    return saved ? JSON.parse(saved) : ['Yellow'];
  });

  useEffect(() => {
    localStorage.setItem('polyDodge_unlocked', JSON.stringify(unlockedItems));
  }, [unlockedItems]);

  const buyItem = (itemId: string, price: number) => {
    if (unlockedItems.includes(itemId)) {
      setSelectedBall(itemId);
      gameRef.current?.applyCustomization('ball', itemId);
    } else {
      if (playerProfile.coins >= price) {
        setPlayerProfile((prev: any) => ({ ...prev, coins: prev.coins - price }));
        setUnlockedItems(prev => [...prev, itemId]);
        setSelectedBall(itemId);
        gameRef.current?.applyCustomization('ball', itemId);
      } else {
        alert('Insufficient Credits!');
      }
    }
  };

  useEffect(() => {
    localStorage.setItem('polyDodge_profile', JSON.stringify(playerProfile));
  }, [playerProfile]);

  const [sensitivity, setSensitivity] = useState(() => {
    const saved = localStorage.getItem('polyDodge_sensitivity');
    return saved ? parseFloat(saved) : 1.0;
  });

  useEffect(() => {
    localStorage.setItem('polyDodge_sensitivity', sensitivity.toString());
  }, [sensitivity]);

  const [showInstructions, setShowInstructions] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCustomization, setShowCustomization] = useState(false);
  const [customizationTab, setCustomizationTab] = useState<'Balls' | 'Emotes'>('Balls');
  const [selectedBall, setSelectedBall] = useState(() => {
    return localStorage.getItem('polyDodge_selectedBall') || 'Yellow';
  });
  const [selectedEmote, setSelectedEmote] = useState(() => {
    return localStorage.getItem('polyDodge_selectedEmote') || 'GG';
  });

  useEffect(() => {
    localStorage.setItem('polyDodge_selectedBall', selectedBall);
  }, [selectedBall]);

  useEffect(() => {
    localStorage.setItem('polyDodge_selectedEmote', selectedEmote);
  }, [selectedEmote]);

  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatSettings, setChatSettings] = useState(() => {
    const saved = localStorage.getItem('polyDodge_chatSettings');
    return saved ? JSON.parse(saved) : {
      channel: 'all' as 'team' | 'all',
      voiceEnabled: true,
      mutedPlayers: [] as string[]
    };
  });

  useEffect(() => {
    localStorage.setItem('polyDodge_chatSettings', JSON.stringify(chatSettings));
  }, [chatSettings]);

  const [peers, setPeers] = useState<Map<string, RTCPeerConnection>>(new Map());
  const localStream = useRef<MediaStream | null>(null);

  const [showInGameMenu, setShowInGameMenu] = useState(false);
  const [showGameEnd, setShowGameEnd] = useState(false);
  const [showEmoteWheel, setShowEmoteWheel] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  // Use a ref for the HUD update callback to avoid stale closures
  const hudCallbackRef = useRef<(data: any) => void>(null);

  useEffect(() => {
    hudCallbackRef.current = (data: any) => {
      setHudData(prev => {
        const newData = { ...prev, ...data };
        
        // Handle kill feed
        if (data.kill) {
          const killFeed = [...(prev.killFeed || []), data.kill].slice(-5);
          newData.killFeed = killFeed;
          
          // Auto-remove kill after 5 seconds
          setTimeout(() => {
            setHudData(p => ({
              ...p,
              killFeed: p.killFeed.filter(k => k.id !== data.kill.id)
            }));
          }, 5000);
        }

        return newData;
      });
    };
  }, [gameState]);

  const balls = ['Yellow', 'Neon Blue', 'Neon Red', 'Rainbow', 'Void', 'Plasma'];
  const emotes = ['Nice shot!', 'Dodge this!', 'GG', 'Oops!', 'Wait...', 'LOL', 'Unlucky'];

  const sendEmote = (emote: string) => {
    if (gameRef.current) {
      gameRef.current.sendEmote(emote);
    }
    setShowEmoteWheel(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState === 'playing') {
        if (e.code === 'Enter') {
          if (isChatOpen) {
            sendChatMessage();
            setIsChatOpen(false);
          } else {
            setIsChatOpen(true);
          }
        }
        if (isChatOpen) return;

        if (e.code === 'Escape' || e.code === 'KeyP') {
          setShowInGameMenu(prev => !prev);
          if (gameRef.current) {
            if (!showInGameMenu) {
              document.exitPointerLock();
            }
          }
        }
        if (e.code === 'KeyV' || e.code === 'KeyB') {
          setShowEmoteWheel(prev => !prev);
        }
        if (hudData.isOut) {
          if (e.code === 'ArrowRight' || e.code === 'KeyD') gameRef.current?.cycleSpectator(1);
          if (e.code === 'ArrowLeft' || e.code === 'KeyA') gameRef.current?.cycleSpectator(-1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, showInGameMenu, hudData.isOut]);

  useEffect(() => {
    if (containerRef.current && !gameRef.current) {
      gameRef.current = new Game(containerRef.current, (data) => {
        if (hudCallbackRef.current) {
          hudCallbackRef.current(data);
        }
      }, setIsMouseLocked);
    }
  }, []);

  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.setSensitivity(sensitivity);
    }
  }, [sensitivity]);

  useEffect(() => {
    // Force connection to production URL for Android APK compatibility
    const SOCKET_URL = "https://polydodge.onrender.com";
    
    const newSocket = io(SOCKET_URL, {
      transports: ["websocket"], // Force WebSocket to avoid polling issues on Android
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server:', newSocket.id);
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setGameState('menu');
      setMatchmakingState('none');
      setMatchRoom(null);
      if (gameRef.current) {
        gameRef.current.dispose();
        gameRef.current = null;
      }
      alert('Disconnected from server. Returning to menu.');
    });

    newSocket.on('room_update', (room) => {
      setMatchRoom(room);
      if (room.state === 'ready_check' || room.state === 'waiting') {
        setMatchmakingState('found');
      }
      if (room.state === 'finished') {
        const votes = room.players.filter((p: any) => p.wantsToPlayAgain).map((p: any) => p.id);
        setHudData(prev => ({ ...prev, playAgainVotes: votes }));
      }
    });

    newSocket.on('game_start', (room) => {
      setMatchRoom(room);
      setMatchmakingState('none');
      startGameOnline(room, newSocket);
    });

    newSocket.on('chat_message', (msg) => {
      if (chatSettings.mutedPlayers.includes(msg.senderId)) return;
      setChatMessages(prev => [...prev, msg].slice(-50));
    });

    newSocket.on('voice_signal', async ({ senderId, signal }) => {
      if (!chatSettings.voiceEnabled || chatSettings.mutedPlayers.includes(senderId)) return;
      
      let pc = peers.get(senderId);
      if (!pc) {
        pc = createPeer(senderId, newSocket);
      }

      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        newSocket.emit('voice_signal', { targetId: senderId, signal: answer });
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    });

    newSocket.on('round_over', ({ winner, blueWins, redWins }) => {
      if (hudCallbackRef.current) {
        hudCallbackRef.current({ roundWinner: winner, blueWins, redWins });
        setTimeout(() => {
           hudCallbackRef.current({ roundWinner: null });
        }, 4000);
      }
    });

    newSocket.on('MATCH_COMPLETE', ({ winner, scoreboard }) => {
      console.log("MATCH_COMPLETE received!", winner, scoreboard);
      setShowGameEnd(true);
      if (hudCallbackRef.current) {
        hudCallbackRef.current({ winner, scoreboard, matchState: 'finished' });
      }
    });

    newSocket.on('game_over', ({ winner, scoreboard }) => {
      setShowGameEnd(true);
      if (hudCallbackRef.current) {
        hudCallbackRef.current({ winner, scoreboard, matchState: 'finished' });
      }
    });

    newSocket.on('kicked', (reason) => {
      setMatchmakingState('none');
      setMatchRoom(null);
      setGameState('menu');
      setShowGameEnd(false);
      if (gameRef.current) {
        gameRef.current.unlock();
      }
      if (reason !== "Match ended.") {
        alert(reason);
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const createPeer = (targetId: string, socket: Socket) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('voice_signal', { targetId, signal: { candidate: event.candidate } });
      }
    };

    pc.ontrack = (event) => {
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      audio.play();
    };

    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
        pc.addTrack(track, localStream.current!);
      });
    }

    setPeers(prev => new Map(prev).set(targetId, pc));
    return pc;
  };

  const startVoice = async () => {
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (socket) {
        // Signal to everyone in room? Actually signaling happens on demand.
      }
    } catch (err) {
      console.error("Failed to get local stream", err);
    }
  };

  const sendChatMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || !socket) return;
    socket.emit('chat_message', { text: chatInput, channel: chatSettings.channel });
    setChatInput('');
  };

  const toggleMute = (playerId: string) => {
    setChatSettings(prev => ({
      ...prev,
      mutedPlayers: prev.mutedPlayers.includes(playerId)
        ? prev.mutedPlayers.filter(id => id !== playerId)
        : [...prev.mutedPlayers, playerId]
    }));
  };

  const startGameOnline = (room: any, activeSocket: Socket) => {
    if (gameRef.current) {
      gameRef.current.startOnline(room, activeSocket);
      setGameState('playing');
      setShowGameEnd(false);
      setHudData(prev => ({ 
        ...prev, 
        winner: null, 
        roundWinner: null, 
        matchState: 'playing',
        scoreboard: null,
        playAgainVotes: null
      }));
    }
  };

  const startMatchmaking = (type: 'casual' | 'ranked') => {
    if (socket) {
      setMatchType(type);
      setMatchmakingState('searching');
      socket.emit('join_matchmaking', { name: playerProfile.username, type });
    }
  };

  const cancelMatchmaking = () => {
    if (socket) {
      socket.emit('leave_matchmaking');
      setMatchmakingState('none');
      setMatchRoom(null);
    }
  };

  const startBots = () => {
    if (gameRef.current) {
      gameRef.current.startOffline();
      setGameState('playing');
      setHudData(prev => ({ ...prev, winner: null, roundWinner: null }));
    }
  };

  const readyUp = () => {
    if (socket) {
      socket.emit('ready_up');
    }
  };

  const playAgainVote = (vote: boolean) => {
    if (socket) {
      socket.emit('play_again_vote', vote);
    }
  };

  const updateUsername = (newName: string) => {
    setPlayerProfile(prev => ({ ...prev, username: newName }));
  };

  return (
    <div className="fixed inset-0 w-[100dvw] h-[100dvh] bg-black overflow-hidden font-sans text-white select-none">
      {/* Mobile Landscape Enforcer */}
      {isMobile && !isLandscape && (
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center p-8 text-center">
          <Smartphone className="w-16 h-16 text-emerald-500 mb-4 animate-spin-slow" />
          <h2 className="text-2xl font-black text-white uppercase tracking-widest mb-2">Rotate Device</h2>
          <p className="text-white/40 font-mono text-sm">Please rotate your device to landscape mode for the best experience.</p>
        </div>
      )}
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* Crosshair */}
      {gameState === 'playing' && (isMouseLocked || isMobile) && !hudData.isOut && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className={`w-4 h-4 border-2 rounded-full flex items-center justify-center transition-all duration-200 ${
            hudData.canPickUp ? 'border-emerald-400 scale-150' : 
            hudData.isAimingAtEnemy ? 'border-red-500 scale-125' : 'border-white/50'
          }`}>
            <div className={`w-1 h-1 rounded-full ${
              hudData.canPickUp ? 'bg-emerald-400' : 
              hudData.isAimingAtEnemy ? 'bg-red-500' : 'bg-white'
            }`} />
          </div>
        </div>
      )}

      {/* HUD */}
      <AnimatePresence>
        {gameState === 'playing' && (
          <>
            {/* Chat UI */}
            <div className={`absolute bottom-24 left-6 z-[100] w-full max-w-[300px] pointer-events-none flex flex-col gap-2 ${isMobile ? (isLandscape ? 'scale-75 origin-bottom-left !bottom-4 !left-4' : 'scale-75 origin-bottom-left !bottom-20 !left-4') : ''}`}>
              <div className="flex-1 overflow-y-auto max-h-[200px] flex flex-col gap-1 pointer-events-none custom-scrollbar">
                {chatMessages.map(msg => (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={msg.id} 
                    className="bg-black/40 backdrop-blur-md border border-white/5 rounded-lg px-3 py-1.5 flex flex-col gap-0.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-[8px] font-black uppercase tracking-widest ${msg.senderTeam === 'blue' ? 'text-blue-400' : 'text-red-400'}`}>
                        {msg.senderName}
                      </span>
                      {msg.channel === 'team' && <span className="text-[6px] bg-white/10 text-white/40 px-1 rounded uppercase">Team</span>}
                    </div>
                    <p className="text-xs text-white/90 font-medium leading-tight break-words">{msg.text}</p>
                  </motion.div>
                ))}
              </div>
              
              <div className="pointer-events-auto">
                {isChatOpen ? (
                  <form onSubmit={sendChatMessage} className="flex gap-2">
                    <input 
                      autoFocus
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onBlur={() => !chatInput && setIsChatOpen(false)}
                      placeholder={`Message ${chatSettings.channel}...`}
                      className="flex-1 bg-black/60 border border-emerald-500/30 rounded-xl px-4 py-2 text-xs text-white focus:border-emerald-500 outline-none transition-all"
                    />
                  </form>
                ) : (
                  <button 
                    onClick={() => setIsChatOpen(true)}
                    className="bg-black/40 hover:bg-black/60 border border-white/5 rounded-xl px-4 py-2 text-[10px] font-black text-white/40 uppercase tracking-widest transition-all"
                  >
                    {isMobile ? 'Chat' : 'Press Enter to Chat'}
                  </button>
                )}
              </div>
            </div>

            {/* Kill Feed - Removed duplicate */}

            {/* Round Winner Overlay */}
            {hudData.roundWinner && !hudData.winner && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center pointer-events-none"
              >
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-center"
                >
                  <h2 className={`${isMobile && isLandscape ? 'text-3xl' : 'text-6xl'} font-black italic tracking-tighter drop-shadow-2xl ${hudData.roundWinner === 'blue' ? 'text-blue-400' : 'text-red-400'}`}>
                    {hudData.roundWinner.toUpperCase()} ROUND WIN!
                  </h2>
                </motion.div>
              </motion.div>
            )}

            {/* Hit Flash Overlay */}
            {hudData.isOut && (
              <div className="absolute inset-0 z-40 bg-red-600/10 pointer-events-none" />
            )}
            
            {/* Round Start Countdown */}
            {countdown > 0 && (
              <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none bg-black/40">
                <motion.div 
                  key={countdown}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.5, opacity: 0 }}
                  className="text-center"
                >
                  <h1 className={`${isMobile && isLandscape ? 'text-[4rem]' : 'text-[12rem]'} font-black italic text-white drop-shadow-[0_0_50px_rgba(255,255,255,0.8)] stroke-black stroke-2`}>
                    {countdown}
                  </h1>
                  <p className={`${isMobile && isLandscape ? 'text-lg' : 'text-4xl'} font-bold uppercase tracking-[1em] text-white/80 mt-4 animate-pulse`}>Get Ready</p>
                </motion.div>
              </div>
            )}



            {hudData.isOut && (
              <div className={`absolute left-1/2 -translate-x-1/2 z-30 text-center ${isMobile && isLandscape ? 'bottom-8 scale-75 origin-bottom' : 'bottom-32'}`}>
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="bg-black/60 backdrop-blur-md border border-white/10 px-8 py-4 rounded-3xl shadow-2xl"
                >
                  <div className="text-[10px] uppercase tracking-[0.3em] text-white/50 font-black mb-2">Spectating Mode</div>
                  <div className="text-lg font-black text-emerald-400 uppercase tracking-widest flex items-center gap-8">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[8px] text-white/30">{isMobile ? 'TAP LEFT' : 'PREV'}</span>
                      <button 
                        onClick={() => gameRef.current?.cycleSpectator(-1)}
                        className="bg-white/10 px-2 py-1 rounded text-xs active:bg-white/30"
                      >
                        {isMobile ? 'PREV' : 'A / LMB'}
                      </button>
                    </div>
                    <div className="h-8 w-px bg-white/10" />
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[8px] text-white/30">{isMobile ? 'TAP RIGHT' : 'NEXT'}</span>
                      <button 
                        onClick={() => gameRef.current?.cycleSpectator(1)}
                        className="bg-white/10 px-2 py-1 rounded text-xs active:bg-white/30"
                      >
                        {isMobile ? 'NEXT' : 'D / RMB'}
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 text-[9px] text-white/40 uppercase font-bold">{isMobile ? 'Swipe right side to orbit' : 'Move mouse to orbit camera'}</div>
                </motion.div>
              </div>
            )}

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`absolute inset-0 pointer-events-none p-4 md:p-6 flex flex-col justify-between ${isMobile ? (isLandscape ? 'scale-90 origin-top' : 'scale-[0.85] origin-center') : ''}`}
            >
            <div className={`flex justify-between items-start w-full ${isMobile && !isLandscape ? 'flex-col items-center gap-2' : ''}`}>
              {/* Left: Empty now (removed Active/Eliminated) */}
              <div />

              {/* Center: Timer & Team Counts */}
              <div className="flex flex-col items-center gap-2 transform -translate-y-2">
                <div className="flex items-center gap-8">
                  {/* Blue Team Count */}
                  <div className="flex flex-col items-end">
                    <div className="text-[8px] font-black text-blue-400/50 uppercase tracking-widest">Blue</div>
                    <div className="flex gap-1 mt-1">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div 
                          key={i} 
                          className={`w-2.5 h-1 rounded-full transition-all duration-500 ${i < hudData.bluePlayersLeft ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]' : 'bg-white/10'}`} 
                        />
                      ))}
                    </div>
                  </div>

                  {/* Timer */}
                  <div className="bg-black/80 backdrop-blur-xl border border-white/10 px-6 py-2 rounded-2xl flex flex-col items-center min-w-[100px] shadow-2xl">
                    <div className={`text-2xl font-mono font-bold tabular-nums ${hudData.timer < 30 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                      {Math.floor(hudData.timer / 60)}:{String(Math.floor(hudData.timer % 60)).padStart(2, '0')}
                    </div>
                  </div>

                  {/* Red Team Count */}
                  <div className="flex flex-col items-start">
                    <div className="text-[8px] font-black text-red-400/50 uppercase tracking-widest">Red</div>
                    <div className="flex gap-1 mt-1">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div 
                          key={i} 
                          className={`w-2.5 h-1 rounded-full transition-all duration-500 ${i < hudData.redPlayersLeft ? 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]' : 'bg-white/10'}`} 
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Team Wins Score */}
              <div className={`bg-black/60 backdrop-blur-md border border-white/10 px-4 py-3 rounded-2xl flex items-center gap-4 ${isMobile ? 'self-end' : ''}`}>
                <div className="flex items-center gap-3 font-black text-xl">
                  <span className="text-blue-400">{hudData.blueWins}</span>
                  <span className="text-white/20">-</span>
                  <span className="text-red-400">{hudData.redWins}</span>
                </div>
                <Trophy className="w-5 h-5 text-amber-400" />
              </div>
            </div>

            {/* Kill Feed */}
            <div className={`absolute top-4 right-4 flex flex-col gap-2 items-end pointer-events-none z-50 ${isMobile && isLandscape ? 'scale-75 origin-top-right' : ''}`}>
              <AnimatePresence>
                {hudData.killFeed?.map((kill: any) => (
                  <motion.div
                    key={kill.id}
                    initial={{ opacity: 0, x: 20, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-lg"
                  >
                    <span className={`font-black uppercase text-sm ${
                      kill.killer === 'YOU' ? 'text-emerald-400' : 
                      (kill.killerTeam === 'blue' ? 'text-blue-400' : 'text-red-400')
                    }`}>
                      {kill.killerName}
                    </span>
                    <Target className="w-3 h-3 text-white/40" />
                    <span className={`font-black uppercase text-sm ${
                      kill.victim === 'YOU' ? 'text-emerald-400' : 
                      (kill.victimTeam === 'blue' ? 'text-blue-400' : 'text-red-400')
                    }`}>
                      {kill.victimName}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Mobile Controls */}
            {isMobile && (
              <>
                <div className="absolute inset-0 pointer-events-none z-50">
                  {/* Left Stick Zone (Movement) - Dynamic */}
                  {!hudData.isOut && (
                    <div ref={joystickMoveContainerRef} className="absolute top-0 bottom-0 left-0 w-1/2 pointer-events-auto touch-none" />
                  )}
                  
                  {/* Right Touch Look Zone - Reverted to old method */}
                  <div 
                    className={`absolute top-0 bottom-0 right-0 ${hudData.isOut ? 'w-full' : 'w-1/2'} pointer-events-auto touch-none`}
                    onTouchStart={handleLookTouchStart}
                    onTouchMove={handleLookTouchMove}
                    onTouchEnd={handleLookTouchEnd}
                    onTouchCancel={handleLookTouchEnd}
                  />
                  
                  {/* Action Buttons - Bottom Right (Thumb Arc) */}
                  {!hudData.isOut && (
                    <div className={`absolute bottom-8 right-8 flex flex-col gap-4 pointer-events-auto items-end ${isLandscape ? '' : ''}`}>
                      {/* Throw Button (Main Action) */}
                      <button 
                        onTouchStart={() => gameRef.current?.setMobileAction('throw', true)}
                        onTouchEnd={() => gameRef.current?.setMobileAction('throw', false)}
                        className="w-24 h-24 rounded-full bg-red-500/20 backdrop-blur-md border border-red-500/30 flex items-center justify-center active:bg-red-500/50 active:scale-95 transition-all shadow-2xl group mb-2 mr-2"
                      >
                        <Target className="w-10 h-10 text-red-400 group-active:text-white" />
                      </button>
                      
                      {/* Block Button (Secondary Action) */}
                      <button 
                        onTouchStart={() => gameRef.current?.setMobileAction('block', true)}
                        onTouchEnd={() => gameRef.current?.setMobileAction('block', false)}
                        className="absolute bottom-0 right-28 w-16 h-16 rounded-full bg-blue-500/20 backdrop-blur-md border border-blue-500/30 flex items-center justify-center active:bg-blue-500/50 active:scale-95 transition-all shadow-xl group"
                      >
                        <Shield className="w-6 h-6 text-blue-400 group-active:text-white" />
                      </button>
                    </div>
                  )}

                  {/* Utility Buttons - Top Left */}
                  <div className="absolute top-4 left-4 pointer-events-auto flex gap-4">
                    <button 
                      onClick={() => setShowInGameMenu(true)}
                      className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center active:bg-white/20 active:scale-90 transition-all"
                    >
                      <div className="flex gap-1">
                        <div className="w-1 h-3 bg-white rounded-full" />
                        <div className="w-1 h-3 bg-white rounded-full" />
                      </div>
                    </button>
                    
                    {!hudData.isOut && (
                      <button 
                        onClick={() => setShowEmoteWheel(true)}
                        className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center active:bg-white/20 active:scale-90 transition-all"
                      >
                        <span className="text-lg">💬</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Hold Time Warning Removed */}

            {/* Bottom HUD: Stamina & Charge */}
            <div className={`flex justify-center items-end pb-6 gap-6 ${isMobile ? (isLandscape ? 'scale-[0.45] origin-bottom opacity-60 pointer-events-none' : 'scale-75 origin-bottom opacity-50 pointer-events-none') : ''}`}>
              {/* Emote Button (PC) */}
              {!isMobile && (
                <button 
                  onClick={() => setShowEmoteWheel(true)}
                  className="bg-black/60 backdrop-blur-md border border-white/10 p-3 rounded-xl shadow-lg hover:bg-white/10 transition-colors pointer-events-auto group"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xl group-hover:scale-110 transition-transform">💬</span>
                    <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">Emote (V)</span>
                  </div>
                </button>
              )}

              {/* Stamina Bar */}
              <div className="w-64 bg-black/60 backdrop-blur-md border border-white/10 p-3 rounded-xl shadow-lg">
                <div className="flex justify-between text-[10px] uppercase tracking-widest font-bold mb-2">
                  <span className="text-white/50">Stamina</span>
                  <span className={hudData.stamina < 20 ? 'text-red-400' : 'text-emerald-400'}>
                    {Math.round(hudData.stamina)}%
                  </span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-100 ${hudData.stamina < 20 ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${hudData.stamina}%` }}
                  />
                </div>
              </div>

              {/* Charge Bar (Only visible when charging/holding) */}
              <div className={`w-64 bg-black/60 backdrop-blur-md border border-white/10 p-3 rounded-xl shadow-lg transition-opacity duration-200 ${hudData.chargeLevel > 0 ? 'opacity-100' : 'opacity-0'}`}>
                <div className="flex justify-between text-[10px] uppercase tracking-widest font-bold mb-2">
                  <span className="text-white/50">Throw Power</span>
                  <span className={hudData.chargeLevel >= 1.5 ? 'text-red-400 animate-pulse' : 'text-amber-400'}>
                    {hudData.chargeLevel >= 1.5 ? 'MAX' : `${Math.round((hudData.chargeLevel / 1.5) * 100)}%`}
                  </span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-75 ${hudData.chargeLevel >= 1.5 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-amber-500'}`}
                    style={{ width: `${(hudData.chargeLevel / 1.5) * 100}%` }}
                  />
                </div>
              </div>
            </div>
            {/* Emote Wheel Overlay */}
            <AnimatePresence>
              {showEmoteWheel && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 pointer-events-auto"
                  onClick={() => setShowEmoteWheel(false)}
                >
                  <motion.div 
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    className={`relative w-80 h-80 flex items-center justify-center ${isMobile ? 'scale-75' : ''}`}
                    onClick={e => e.stopPropagation()}
                  >
                    {/* Radial Wheel */}
                    <div className="absolute inset-0 rounded-full border-4 border-white/5 bg-black/20 backdrop-blur-sm" />
                    <div className="relative z-10 text-center">
                       <div className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-1">Emote</div>
                       <div className="text-white/20 text-xs">Select One</div>
                    </div>

                    {emotes.map((emote, i) => {
                      const angle = (i / emotes.length) * Math.PI * 2 - Math.PI / 2;
                      const x = Math.cos(angle) * 110;
                      const y = Math.sin(angle) * 110;
                      return (
                        <motion.button 
                          key={emote}
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.05 }}
                          onClick={() => {
                            sendEmote(emote);
                            setShowEmoteWheel(false);
                          }}
                          style={{ 
                            position: 'absolute',
                            left: `calc(50% + ${x}px)`,
                            top: `calc(50% + ${y}px)`,
                            transform: 'translate(-50%, -50%)'
                          }}
                          className="w-16 h-16 bg-zinc-900 hover:bg-emerald-500 hover:text-black border border-white/10 rounded-full font-bold text-[10px] transition-all active:scale-95 flex items-center justify-center p-2 text-center shadow-xl"
                        >
                          {emote}
                        </motion.button>
                      );
                    })}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>

      {/* Main Menu */}
      <AnimatePresence>
        {gameState === 'menu' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`absolute inset-0 z-50 flex bg-zinc-950 overflow-y-auto ${isMobile && !isLandscape ? 'flex-col' : 'flex-row'}`}
          >
            {/* Split Layout: Left Side (Branding & Profile) */}
            <div className={`relative flex-1 flex flex-col justify-between ${isMobile && isLandscape ? 'p-4' : 'p-6 md:p-16'} border-r border-white/5 ${isMobile && !isLandscape ? 'min-h-screen' : ''}`}>
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_0%_0%,_var(--tw-gradient-stops))] from-emerald-500/40 via-transparent to-transparent pointer-events-none" />
              
              {/* Branding */}
              <div className="relative z-10">
                <motion.div
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  className="flex items-center gap-4 mb-4"
                >
                  <div className="w-12 h-1 h-px bg-emerald-500" />
                  <span className="text-emerald-500 font-black tracking-[0.4em] uppercase text-[10px]">Arena v2.0</span>
                </motion.div>
                <h1 className={`${isMobile ? (isLandscape ? 'text-3xl' : 'text-4xl md:text-6xl') : 'text-[120px]'} font-black tracking-tighter leading-[0.85] uppercase italic text-white mb-6`}>
                  Poly<br/><span className="text-emerald-500">Dodge</span>
                </h1>
                <p className="text-white/40 max-w-sm font-medium leading-relaxed text-[10px] md:text-base">
                  The ultimate low-poly competitive dodgeball arena. Aim, dodge, and dominate the leaderboard in high-stakes 4v4 matches.
                </p>
              </div>

              {/* Profile Section */}
              <div className={`relative z-10 flex ${isMobile && !isLandscape ? 'flex-col items-stretch gap-3' : 'items-end gap-4 md:gap-6'} mt-8 md:mt-0`}>
                <div className={`bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-[24px] md:rounded-[32px] ${isMobile && isLandscape ? 'p-2' : 'p-3 md:p-6'} flex items-center gap-4 md:gap-6 shadow-2xl`}>
                  <div className="relative shrink-0">
                    <div className={`${isMobile && isLandscape ? 'w-8 h-8' : 'w-10 h-10 md:w-16 md:h-16'} rounded-xl md:rounded-2xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30 overflow-hidden`}>
                      <span className={`font-black text-emerald-400 ${isMobile && isLandscape ? 'text-sm' : 'text-lg md:text-2xl'}`}>{playerProfile.level}</span>
                    </div>
                    <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-black text-[7px] md:text-[10px] font-black px-1.5 md:px-2 py-0.5 rounded-full shadow-lg">LVL</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <input 
                      type="text"
                      maxLength={12}
                      value={playerProfile.username}
                      onChange={(e) => updateUsername(e.target.value)}
                      className={`bg-transparent font-black text-white focus:outline-none border-b-2 border-transparent focus:border-emerald-500/50 transition-all w-full ${isMobile && isLandscape ? 'text-base' : 'text-lg md:text-2xl'} mb-1`}
                      placeholder="Enter Name"
                    />
                    <div className="flex items-center gap-3">
                      <span className="text-[7px] md:text-[10px] font-black text-emerald-400 uppercase tracking-widest truncate">{playerProfile.rank}</span>
                      <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" 
                          style={{ width: `${(playerProfile.xp / playerProfile.nextXp) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`bg-zinc-900/50 backdrop-blur-xl border border-white/10 rounded-[24px] md:rounded-[32px] ${isMobile && isLandscape ? 'p-2' : 'p-3 md:p-6'} flex items-center gap-4 shadow-2xl`}>
                  <div className={`${isMobile && isLandscape ? 'w-6 h-6' : 'w-7 h-7 md:w-10 md:h-10'} rounded-full bg-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.4)] flex items-center justify-center shrink-0`}>
                    <div className={`${isMobile && isLandscape ? 'w-2 h-2' : 'w-2.5 h-2.5 md:w-4 md:h-4'} rounded-full border-2 border-amber-600/30`} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[7px] md:text-[10px] font-black text-white/30 uppercase tracking-widest leading-none mb-1">Credits</span>
                    <span className={`font-mono font-black text-amber-400 ${isMobile && isLandscape ? 'text-base' : 'text-lg md:text-2xl'} leading-none`}>{playerProfile.coins.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side (Actions & Modes) */}
            <div className={`relative flex-1 bg-zinc-900/20 flex flex-col justify-center ${isMobile && isLandscape ? 'p-4' : 'p-6 md:p-16'} ${isMobile && !isLandscape ? 'pb-24' : ''}`}>
              <div className="absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_100%_100%,_var(--tw-gradient-stops))] from-emerald-500/40 via-transparent to-transparent pointer-events-none" />
              
              <div className={`w-full ${isMobile && !isLandscape ? 'max-w-md mx-auto' : 'max-w-md'} space-y-4 md:space-y-6 relative z-10`}>
                <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.5em] mb-2 md:mb-4 text-center md:text-left">Select Game Mode</div>
                
                <button 
                  onClick={() => startMatchmaking('ranked')}
                  className={`w-full group relative overflow-hidden bg-white text-black ${isMobile && isLandscape ? 'px-4 py-4 rounded-[16px]' : 'px-5 md:px-8 py-5 md:py-8 rounded-[20px] md:rounded-[32px]'} font-black flex items-center justify-between transition-all hover:scale-[1.02] active:scale-95 shadow-2xl`}
                >
                  <div className="flex items-center gap-4 md:gap-6 relative z-10">
                    <div className={`${isMobile && isLandscape ? 'w-8 h-8' : 'w-10 h-10 md:w-14 md:h-14'} rounded-xl md:rounded-2xl bg-black flex items-center justify-center group-hover:rotate-12 transition-transform`}>
                      <Globe className={`${isMobile && isLandscape ? 'w-5 h-5' : 'w-6 h-6 md:w-8 md:h-8'} text-emerald-400`} />
                    </div>
                    <div className="flex flex-col items-start">
                      <span className={`${isMobile && isLandscape ? 'text-base' : 'text-lg md:text-2xl'} tracking-tighter`}>RANKED MATCH</span>
                      <span className="text-[7px] md:text-[10px] font-bold opacity-40 tracking-widest uppercase">Competitive 4v4 Arena</span>
                    </div>
                  </div>
                  <div className={`${isMobile && isLandscape ? 'w-6 h-6' : 'w-7 h-7 md:w-10 md:h-10'} rounded-full border-2 border-black/10 flex items-center justify-center group-hover:bg-black group-hover:text-white transition-all`}>
                    <Play className={`${isMobile && isLandscape ? 'w-2 h-2' : 'w-2.5 h-2.5 md:w-4 md:h-4'}`} />
                  </div>
                </button>

                <div className={`grid grid-cols-2 ${isMobile && isLandscape ? 'gap-2' : 'gap-3 md:gap-4'}`}>
                  <button 
                    onClick={() => startMatchmaking('casual')}
                    className={`group bg-zinc-900/50 hover:bg-zinc-800 backdrop-blur-md border border-white/5 hover:border-white/20 ${isMobile && isLandscape ? 'p-2 rounded-[16px]' : 'p-3 md:p-6 rounded-[20px] md:rounded-[32px]'} flex flex-col items-center gap-2 md:gap-3 transition-all active:scale-95`}
                  >
                    <div className={`${isMobile && isLandscape ? 'w-6 h-6' : 'w-8 h-8 md:w-12 md:h-12'} rounded-xl md:rounded-2xl bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                      <Users className={`${isMobile && isLandscape ? 'w-3 h-3' : 'w-4 h-4 md:w-6 md:h-6'} text-blue-400`} />
                    </div>
                    <span className="font-black uppercase tracking-widest text-[8px] md:text-xs">Casual</span>
                  </button>
                  
                  <button 
                    onClick={startBots}
                    className={`group bg-zinc-900/50 hover:bg-zinc-800 backdrop-blur-md border border-white/5 hover:border-white/20 ${isMobile && isLandscape ? 'p-2 rounded-[16px]' : 'p-3 md:p-6 rounded-[20px] md:rounded-[32px]'} flex flex-col items-center gap-2 md:gap-3 transition-all active:scale-95`}
                  >
                    <div className={`${isMobile && isLandscape ? 'w-6 h-6' : 'w-8 h-8 md:w-12 md:h-12'} rounded-xl md:rounded-2xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                      <Play className={`${isMobile && isLandscape ? 'w-3 h-3' : 'w-4 h-4 md:w-6 md:h-6'} text-white/60`} />
                    </div>
                    <span className="font-black uppercase tracking-widest text-[8px] md:text-xs">Practice</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 md:gap-4 pt-4 md:pt-6">
                  <button 
                    onClick={() => setShowCustomization(true)}
                    className="bg-zinc-900/50 hover:bg-zinc-800 border border-white/5 p-3 md:p-4 rounded-xl md:rounded-2xl flex flex-col items-center gap-2 transition-all active:scale-95 group"
                  >
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Palette className="w-4 h-4 md:w-5 h-5 text-emerald-400" />
                    </div>
                    <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-white">Vault</span>
                  </button>

                  <button 
                    onClick={() => setShowSettings(true)}
                    className="bg-zinc-900/50 hover:bg-zinc-800 border border-white/5 p-3 md:p-4 rounded-xl md:rounded-2xl flex flex-col items-center gap-2 transition-all active:scale-95 group"
                  >
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Settings className="w-4 h-4 md:w-5 h-5 text-white/40 group-hover:text-white" />
                    </div>
                    <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-white">Config</span>
                  </button>
                </div>

                <button 
                  onClick={() => setShowInstructions(true)}
                  className="w-full py-3 md:py-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl md:rounded-2xl text-[8px] md:text-[10px] font-black uppercase tracking-[0.4em] text-white/30 hover:text-white transition-all"
                >
                  How to Play
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Matchmaking Overlay */}
      <AnimatePresence>
        {matchmakingState !== 'none' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[120] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className={`w-full max-w-4xl bg-zinc-900 border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl flex flex-col ${isMobile ? (isLandscape ? 'scale-[0.55] origin-center' : 'scale-[0.85] md:scale-100 origin-center') : ''} ${isMobile && isLandscape ? 'max-h-[95vh]' : ''}`}
            >
              <div className={`${isMobile && isLandscape ? 'p-4' : 'p-12'} text-center border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent`}>
                <div className={`flex items-center justify-center gap-3 ${isMobile && isLandscape ? 'mb-2' : 'mb-6'}`}>
                  <div className="w-12 h-1 bg-emerald-500" />
                  <span className={`text-emerald-500 font-black tracking-[0.5em] uppercase ${isMobile && isLandscape ? 'text-[8px]' : 'text-xs'}`}>
                    {matchmakingState === 'searching' ? 'Global Matchmaking' : 'Battle Lobby'}
                  </span>
                  <div className="w-12 h-1 bg-emerald-500" />
                </div>
                
                <h2 className={`${isMobile && isLandscape ? 'text-4xl' : 'text-6xl md:text-8xl'} font-black italic uppercase tracking-tighter text-white leading-none mb-4`}>
                  {matchmakingState === 'searching' ? 'Searching...' : 'Ready Up'}
                </h2>
                
                <div className={`text-white/30 font-black uppercase tracking-[0.3em] ${isMobile && isLandscape ? 'text-[8px]' : 'text-sm'}`}>
                  {matchType === 'ranked' ? 'Ranked 4v4 Arena' : 'Casual 4v4 Arena'}
                </div>
              </div>

              <div className={`${isMobile && isLandscape ? 'p-4 gap-4' : 'p-12 gap-12'} flex flex-col items-center overflow-y-auto`}>
                {matchmakingState === 'searching' && !matchRoom && (
                  <div className="flex flex-col items-center">
                    <div className={`relative ${isMobile && isLandscape ? 'w-16 h-16 mb-4' : 'w-32 h-32 mb-8'}`}>
                      <div className="absolute inset-0 border-8 border-emerald-500/10 rounded-full" />
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-0 border-8 border-transparent border-t-emerald-500 rounded-full shadow-[0_0_30px_rgba(16,185,129,0.4)]"
                      />
                    </div>
                    <div className={`${isMobile && isLandscape ? 'text-lg' : 'text-2xl'} font-black text-white uppercase italic tracking-tight mb-2`}>Establishing Connection</div>
                    <div className="text-white/40 text-[8px] font-bold uppercase tracking-widest text-center">Scanning for available servers...</div>
                  </div>
                )}

                {(matchmakingState === 'found' || (matchmakingState === 'searching' && matchRoom)) && matchRoom && (
                  <div className={`w-full ${isMobile && isLandscape ? 'space-y-4' : 'space-y-12'}`}>
                    <div className={`grid grid-cols-2 ${isMobile && isLandscape ? 'gap-4' : 'gap-12'}`}>
                      {/* Blue Team */}
                      <div className={`${isMobile && isLandscape ? 'space-y-2' : 'space-y-6'}`}>
                        <div className="flex items-center justify-between border-b border-blue-500/30 pb-2">
                          <span className="text-blue-400 font-black uppercase tracking-widest text-[8px] italic">Blue Team</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {matchRoom.players.filter((p: any) => p.team === 'blue').map((p: any) => (
                            <div key={p.id} className={`bg-blue-500/5 border border-blue-500/10 ${isMobile && isLandscape ? 'p-2' : 'p-4'} rounded-xl flex items-center justify-between`}>
                              <span className={`text-white font-bold ${isMobile && isLandscape ? 'text-[10px]' : 'text-sm'}`}>{p.id === socket?.id ? p.name : 'Agent'}</span>
                              <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.5)]" />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Red Team */}
                      <div className={`${isMobile && isLandscape ? 'space-y-2' : 'space-y-6'}`}>
                        <div className="flex items-center justify-between border-b border-red-500/30 pb-2">
                          <span className="text-red-400 font-black uppercase tracking-widest text-[8px] italic">Red Team</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {matchRoom.players.filter((p: any) => p.team === 'red').map((p: any) => (
                            <div key={p.id} className={`bg-red-500/5 border border-red-500/10 ${isMobile && isLandscape ? 'p-2' : 'p-4'} rounded-xl flex items-center justify-between`}>
                              <span className={`text-white font-bold ${isMobile && isLandscape ? 'text-[10px]' : 'text-sm'}`}>{p.id === socket?.id ? p.name : 'Agent'}</span>
                              <div className="w-2 h-2 rounded-full bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.5)]" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className={`bg-white/5 border border-white/10 ${isMobile && isLandscape ? 'p-4 rounded-2xl' : 'p-8 rounded-[2.5rem]'} flex items-center justify-between`}>
                      <div className="flex items-center gap-4">
                        <div className={`${isMobile && isLandscape ? 'w-10 h-10' : 'w-16 h-16'} rounded-xl bg-emerald-500/10 flex items-center justify-center`}>
                          <Trophy className={`${isMobile && isLandscape ? 'w-5 h-5' : 'w-8 h-8'} text-emerald-400`} />
                        </div>
                        <div>
                          <div className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-0.5">Match Rules</div>
                          <div className={`${isMobile && isLandscape ? 'text-lg' : 'text-2xl'} font-black text-white uppercase italic`}>First to 4 Wins</div>
                        </div>
                      </div>
                      
                      {matchRoom.state === 'ready_check' && (
                        <div className="text-right">
                          <div className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-0.5">Start In</div>
                          <div className={`${isMobile && isLandscape ? 'text-2xl' : 'text-4xl'} font-black text-white font-mono`}>{matchRoom.timer}s</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <button 
                  onClick={cancelMatchmaking}
                  className={`${isMobile && isLandscape ? 'px-8 py-3' : 'px-16 py-5'} bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 border border-white/10 hover:border-red-500/30 rounded-2xl font-black uppercase tracking-[0.3em] transition-all active:scale-95 text-[10px]`}
                >
                  Abort Mission
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game End Overlay - Remade */}
      {showGameEnd && (
        <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 font-sans">
          <div className={`w-full max-w-5xl bg-zinc-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-300 ${isMobile ? (isLandscape ? 'scale-[0.55] origin-center' : 'scale-[0.85] md:scale-100 origin-center') : ''}`}>
            {/* Header */}
              <div className={`${isMobile && isLandscape ? 'p-4' : 'p-8 md:p-10'} text-center ${hudData.winner === 'blue' ? 'bg-blue-900/20' : 'bg-red-900/20'} border-b border-white/5 relative overflow-hidden`}>
                <div className={`absolute inset-0 opacity-10 ${hudData.winner === 'blue' ? 'bg-blue-500' : 'bg-red-500'} blur-3xl`} />
                <h2 className={`relative z-10 ${isMobile && isLandscape ? 'text-3xl' : 'text-5xl md:text-7xl'} font-black uppercase italic tracking-tighter ${hudData.winner === 'blue' ? 'text-blue-400' : 'text-red-400'}`}>
                  {hudData.winner ? `${hudData.winner} VICTORY` : 'GAME OVER'}
                </h2>
                <div className="relative z-10 mt-2 text-white/40 font-mono text-sm uppercase tracking-[0.3em]">
                  Match Complete
                </div>
              </div>

              {/* Scoreboard Content */}
              <div className={`flex-1 overflow-y-auto ${isMobile && isLandscape ? 'p-2 space-y-2' : 'p-6 md:p-8 space-y-8'} custom-scrollbar bg-zinc-950/50`}>
                <div className={`grid grid-cols-1 md:grid-cols-2 ${isMobile && isLandscape ? 'gap-4' : 'gap-8'}`}>
                  {['blue', 'red'].map(team => (
                    <div key={team} className={`${isMobile && isLandscape ? 'space-y-2' : 'space-y-4'}`}>
                      <div className="flex items-center justify-between border-b border-white/5 pb-1">
                        <h3 className={`${isMobile && isLandscape ? 'text-sm' : 'text-xl'} font-black uppercase tracking-widest ${team === 'blue' ? 'text-blue-400' : 'text-red-400'}`}>
                          {team} Team
                        </h3>
                        <div className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${team === 'blue' ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400'}`}>
                          {team === 'blue' ? hudData.blueWins : hudData.redWins} Rounds
                        </div>
                      </div>
                      
                      <div className={`${isMobile && isLandscape ? 'space-y-1' : 'space-y-2'}`}>
                        {(hudData.scoreboard || [])
                          .filter(p => p.team === team)
                          .map(player => (
                            <div key={player.id} className={`bg-white/5 ${isMobile && isLandscape ? 'p-2' : 'p-3'} rounded-xl flex items-center justify-between group hover:bg-white/10 transition-colors border border-transparent hover:border-white/5`}>
                              <div className="flex items-center gap-2">
                                <div className={`${isMobile && isLandscape ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-lg'} rounded-lg flex items-center justify-center font-black ${team === 'blue' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}`}>
                                  {player.name[0]}
                                </div>
                                <div>
                                  <div className={`font-bold text-white flex items-center gap-2 ${isMobile && isLandscape ? 'text-xs' : ''}`}>
                                    {player.name}
                                    {player.id === socket?.id && <span className="text-[7px] bg-emerald-500 text-black px-1 py-0.5 rounded-full font-black tracking-wide">YOU</span>}
                                  </div>
                                </div>
                              </div>
                              
                              <div className={`flex ${isMobile && isLandscape ? 'gap-2' : 'gap-4'} text-right`}>
                                 <div className={`flex flex-col items-end ${isMobile && isLandscape ? 'w-8' : 'w-12'}`}>
                                   <span className={`text-white font-black leading-none ${isMobile && isLandscape ? 'text-sm' : 'text-lg'}`}>{player.stats.eliminations}</span>
                                   <span className="text-[6px] uppercase text-white/30 font-bold tracking-wider">Kills</span>
                                 </div>
                                 <div className={`flex flex-col items-end ${isMobile && isLandscape ? 'w-8' : 'w-12'}`}>
                                   <span className={`text-emerald-400 font-black leading-none ${isMobile && isLandscape ? 'text-sm' : 'text-lg'}`}>{player.stats.catches}</span>
                                   <span className="text-[6px] uppercase text-emerald-400/50 font-bold tracking-wider">Catch</span>
                                 </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer Actions */}
              <div className={`${isMobile && isLandscape ? 'p-3' : 'p-6 md:p-8'} bg-zinc-900 border-t border-white/5 flex flex-col md:flex-row gap-4 justify-center items-center shrink-0`}>
                 {matchType === 'casual' && socket && (
                   <button 
                     onClick={() => playAgainVote(true)}
                     disabled={hudData.playAgainVotes?.includes(socket.id)}
                     className={`w-full md:w-auto px-10 py-4 rounded-xl font-black uppercase tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center gap-3 ${
                       hudData.playAgainVotes?.includes(socket.id) 
                         ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 cursor-default' 
                         : 'bg-white text-black hover:bg-emerald-400 hover:scale-105 shadow-lg hover:shadow-emerald-400/20'
                     }`}
                   >
                     {hudData.playAgainVotes?.includes(socket.id) ? (
                       <>
                         <span>Ready</span>
                         <span className="bg-emerald-500 text-black text-[10px] px-1.5 py-0.5 rounded-full">
                           {hudData.playAgainVotes.length} / {(hudData.scoreboard || []).length}
                         </span>
                       </>
                     ) : (
                       'Play Again'
                     )}
                   </button>
                 )}

                 {!socket && (
                   <button 
                     onClick={() => {
                       setShowGameEnd(false);
                       if (gameRef.current) {
                         gameRef.current.startOffline();
                       }
                     }}
                     className="w-full md:w-auto px-10 py-4 bg-white text-black rounded-xl font-black uppercase tracking-[0.2em] hover:bg-emerald-400 hover:scale-105 shadow-lg hover:shadow-emerald-400/20 transition-all active:scale-95"
                   >
                     Play Again
                   </button>
                 )}
                 
                 <button 
                   onClick={() => {
                     setShowGameEnd(false);
                     setGameState('menu');
                     setMatchmakingState('none');
                     if (gameRef.current) gameRef.current.unlock();
                   }}
                   className="w-full md:w-auto px-10 py-4 bg-white/5 border border-white/10 rounded-xl font-black uppercase tracking-[0.2em] hover:bg-white/10 hover:text-white transition-all active:scale-95 text-white/50"
                 >
                   Return to Menu
                 </button>
              </div>
            </div>
          </div>
        )}

      {/* Customization (Vault) Modal */}
      <AnimatePresence>
        {showCustomization && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[110] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className={`w-full max-w-5xl bg-zinc-900 border border-white/10 rounded-[2.5rem] overflow-hidden flex flex-col h-[85vh] shadow-[0_0_100px_rgba(0,0,0,0.5)] ${isMobile ? (isLandscape ? 'scale-[0.55] md:scale-100' : 'scale-[0.85] md:scale-100') : ''}`}
            >
              {/* Header */}
              <div className={`${isMobile && isLandscape ? 'p-4' : 'p-8 md:p-12'} border-b border-white/5 flex items-end justify-between bg-gradient-to-b from-white/5 to-transparent`}>
                <div>
                  <div className={`flex items-center gap-3 ${isMobile && isLandscape ? 'mb-2' : 'mb-4'}`}>
                    <div className="w-8 h-1 bg-emerald-500" />
                    <span className="text-emerald-500 font-black tracking-[0.4em] uppercase text-[10px]">Equipment Vault</span>
                  </div>
                  <h2 className={`${isMobile && isLandscape ? 'text-2xl' : 'text-5xl md:text-7xl'} font-black italic uppercase tracking-tighter text-white leading-none`}>
                    Your <span className="text-emerald-500">Arsenal</span>
                  </h2>
                </div>
                
                <button 
                  onClick={() => setShowCustomization(false)}
                  className={`${isMobile && isLandscape ? 'w-10 h-10' : 'w-16 h-16'} rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all active:scale-90 group`}
                >
                  <X className={`${isMobile && isLandscape ? 'w-5 h-5' : 'w-8 h-8'} text-white/40 group-hover:text-white transition-colors`} />
                </button>
              </div>

              {/* Tabs */}
              <div className={`flex ${isMobile && isLandscape ? 'px-4' : 'px-8 md:px-12'} gap-8 border-b border-white/5`}>
                {(['Balls'] as const).map((tab) => (
                  <button 
                    key={tab} 
                    onClick={() => setCustomizationTab(tab)}
                    className={`${isMobile && isLandscape ? 'py-3' : 'py-6'} font-black uppercase tracking-[0.3em] text-[10px] transition-all relative ${
                      customizationTab === tab ? 'text-white' : 'text-white/20 hover:text-white/40'
                    }`}
                  >
                    {tab}
                    {customizationTab === tab && (
                      <motion.div 
                        layoutId="activeTab"
                        className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.8)]"
                      />
                    )}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-12 custom-scrollbar bg-zinc-950/20">
                <div className={`grid ${isMobile && isLandscape ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-2 lg:grid-cols-3'} gap-3 md:gap-6`}>
                  {customizationTab === 'Balls' && balls.map(ball => {
                    const isUnlocked = unlockedItems.includes(ball);
                    const price = ball === 'Yellow' ? 0 : 
                                  ball === 'Neon Blue' ? 250 : 
                                  ball === 'Neon Red' ? 250 : 
                                  ball === 'Void' ? 1000 : 
                                  ball === 'Plasma' ? 750 : 2000;

                    return (
                      <button 
                        key={ball}
                        onClick={() => {
                          if (isUnlocked) {
                            setSelectedBall(ball);
                            gameRef.current?.applyCustomization('ball', ball);
                          } else if (playerProfile.coins >= price) {
                            buyItem(ball, price);
                          }
                        }}
                        className={`group relative p-3 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border transition-all flex flex-col gap-3 md:gap-6 ${
                          selectedBall === ball 
                            ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_40px_rgba(16,185,129,0.1)]' 
                            : isUnlocked 
                              ? 'bg-white/5 border-white/5 hover:border-white/20'
                              : 'bg-black/40 border-white/5 opacity-80 hover:opacity-100'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className={`w-12 h-12 md:w-20 md:h-20 rounded-full border-2 md:border-4 flex items-center justify-center transition-transform group-hover:scale-110 ${
                            ball === 'Yellow' ? 'bg-yellow-400 border-yellow-200' :
                            ball === 'Neon Blue' ? 'bg-cyan-400 border-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.6)]' :
                            ball === 'Neon Red' ? 'bg-red-400 border-red-200 shadow-[0_0_20px_rgba(248,113,113,0.6)]' :
                            ball === 'Void' ? 'bg-zinc-950 border-purple-900 shadow-[0_0_25px_rgba(147,51,234,0.4)]' :
                            ball === 'Plasma' ? 'bg-pink-500 border-pink-300 shadow-[0_0_25px_rgba(236,72,153,0.5)]' :
                            'bg-gradient-to-tr from-red-500 via-green-500 to-blue-500 border-white shadow-[0_0_20px_rgba(255,255,255,0.3)]'
                          }`}>
                            {!isUnlocked && <Lock className="w-4 h-4 md:w-8 md:h-8 text-white/40 absolute" />}
                            <div className="w-6 h-6 md:w-10 md:h-10 rounded-full bg-white/10 border border-white/20 blur-[1px]" />
                          </div>
                          {selectedBall === ball ? (
                            <div className="bg-emerald-500 text-black text-[7px] md:text-[10px] font-black px-2 md:px-3 py-0.5 md:py-1 rounded-full uppercase tracking-widest">Equipped</div>
                          ) : !isUnlocked ? (
                            <div className="flex items-center gap-1.5 md:gap-2 bg-amber-500 text-black text-[7px] md:text-[10px] font-black px-2 md:px-3 py-0.5 md:py-1 rounded-full uppercase tracking-widest">
                              <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-amber-700/30" />
                              {price}
                            </div>
                          ) : (
                            <div className="bg-white/10 text-white/40 text-[7px] md:text-[10px] font-black px-2 md:px-3 py-0.5 md:py-1 rounded-full uppercase tracking-widest">Unlocked</div>
                          )}
                        </div>
                        
                        <div className="text-left">
                          <div className="text-sm md:text-2xl font-black text-white italic uppercase tracking-tighter mb-0.5 md:mb-1">{ball}</div>
                          <div className="text-[7px] md:text-[10px] font-bold text-white/30 uppercase tracking-widest">
                            {isUnlocked ? 'Standard Issue' : 'Restricted'}
                          </div>
                        </div>

                        <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isUnlocked ? 'bg-white text-black' : 'bg-amber-500 text-black'}`}>
                            {isUnlocked ? <Play className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="p-8 border-t border-white/5 bg-zinc-950/50 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.4)] flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full border border-amber-600/30" />
                  </div>
                  <div>
                    <div className="text-[8px] font-black text-white/30 uppercase tracking-widest">Available Balance</div>
                    <div className="font-mono font-black text-amber-400 text-lg">{playerProfile.coins.toLocaleString()}</div>
                  </div>
                </div>
                
                <button 
                  onClick={() => setShowCustomization(false)}
                  className="px-12 py-4 bg-white text-black rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-400 transition-all active:scale-95 shadow-xl"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* In-Game Menu (Pause) */}
      <AnimatePresence>
        {showInGameMenu && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              className={`w-full max-w-sm bg-zinc-900 border border-white/10 rounded-[3rem] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] ${isMobile ? (isLandscape ? 'scale-[0.55] md:scale-100' : 'scale-[0.85] md:scale-100') : ''}`}
            >
              <div className={`${isMobile && isLandscape ? 'p-4' : 'p-12'} text-center bg-gradient-to-b from-white/5 to-transparent`}>
                <div className={`flex items-center justify-center gap-3 ${isMobile && isLandscape ? 'mb-2' : 'mb-6'}`}>
                  <div className="w-8 h-1 bg-white/20" />
                  <span className="text-white/40 font-black tracking-[0.4em] uppercase text-[10px]">System Paused</span>
                  <div className="w-8 h-1 bg-white/20" />
                </div>
                <h2 className={`${isMobile && isLandscape ? 'text-3xl' : 'text-6xl'} font-black italic uppercase tracking-tighter text-white leading-none mb-2`}>Tactical</h2>
                <h2 className={`${isMobile && isLandscape ? 'text-xl' : 'text-4xl'} font-black italic uppercase tracking-tighter text-emerald-500 leading-none`}>Intermission</h2>
              </div>
              
              <div className={`${isMobile && isLandscape ? 'p-4 space-y-2' : 'p-8 space-y-4'}`}>
                <button 
                  onClick={() => setShowInGameMenu(false)}
                  className={`w-full bg-emerald-500 text-black ${isMobile && isLandscape ? 'py-3' : 'py-6'} rounded-2xl font-black uppercase tracking-[0.4em] hover:bg-emerald-400 transition-all active:scale-95 shadow-2xl flex items-center justify-center gap-3 text-xs`}
                >
                  <Play className="w-4 h-4 fill-current" />
                  Resume
                </button>
                
                <button 
                  onClick={() => {
                    setShowInGameMenu(false);
                    setShowSettings(true);
                  }}
                  className={`w-full bg-white/5 text-white ${isMobile && isLandscape ? 'py-3' : 'py-6'} rounded-2xl font-black uppercase tracking-[0.4em] hover:bg-white/10 transition-all active:scale-95 border border-white/5 flex items-center justify-center gap-3 text-xs`}
                >
                  <Settings className="w-4 h-4" />
                  Config
                </button>

                <div className={`${isMobile && isLandscape ? 'pt-2 mt-2' : 'pt-4 mt-4'} border-t border-white/5`}>
                  <button 
                    onClick={() => window.location.reload()}
                    className={`w-full bg-red-500/10 text-red-500 ${isMobile && isLandscape ? 'py-3' : 'py-6'} rounded-2xl font-black uppercase tracking-[0.4em] hover:bg-red-500/20 transition-all active:scale-95 border border-red-500/10 flex items-center justify-center gap-3 text-xs`}
                  >
                    <X className="w-4 h-4" />
                    Abort Mission
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Config (Settings) Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[110] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className={`w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl ${isMobile ? (isLandscape ? 'scale-[0.6] md:scale-100' : 'scale-[0.85] md:scale-100') : ''}`}
            >
              <div className={`${isMobile && isLandscape ? 'p-4' : 'p-8 md:p-12'} border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent`}>
                <div className={`flex items-center gap-3 ${isMobile && isLandscape ? 'mb-2' : 'mb-4'}`}>
                  <div className="w-8 h-1 bg-emerald-500" />
                  <span className="text-emerald-500 font-black tracking-[0.4em] uppercase text-[10px]">System Configuration</span>
                </div>
                <h2 className={`${isMobile && isLandscape ? 'text-2xl' : 'text-4xl md:text-6xl'} font-black italic uppercase tracking-tighter text-white leading-none`}>
                  Global <span className="text-emerald-500">Config</span>
                </h2>
              </div>
              
              <div className={`${isMobile && isLandscape ? 'p-4 space-y-4' : 'p-8 md:p-12 space-y-10'} overflow-y-auto max-h-[60vh] custom-scrollbar`}>
                <div>
                  <div className="flex justify-between items-end mb-6">
                    <div>
                      <label className="font-black uppercase text-[10px] text-emerald-400 tracking-[0.3em] mb-1 block">Input Sensitivity</label>
                      <div className="text-white/40 text-xs font-medium">Adjust camera rotation speed</div>
                    </div>
                    <span className="font-mono font-black text-white text-2xl">{sensitivity.toFixed(1)}</span>
                  </div>
                  <div className="relative h-12 flex items-center">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full h-1.5 bg-white/5 rounded-full" />
                    </div>
                    <input 
                      type="range" 
                      min="0.1" 
                      max="3.0" 
                      step="0.1" 
                      value={sensitivity}
                      onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                      className="relative w-full h-1.5 bg-transparent appearance-none cursor-pointer accent-emerald-500 z-10"
                    />
                  </div>
                </div>

                {/* Chat Settings */}
                <div className="space-y-6">
                  <div className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em]">Communications</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/5 flex flex-col gap-3">
                      <div className="text-[10px] font-black text-white/30 uppercase tracking-widest">Chat Channel</div>
                      <div className="flex gap-2">
                        {['all', 'team'].map(ch => (
                          <button 
                            key={ch}
                            onClick={() => setChatSettings(prev => ({ ...prev, channel: ch as any }))}
                            className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${chatSettings.channel === ch ? 'bg-emerald-500 text-black' : 'bg-white/5 text-white/40'}`}
                          >
                            {ch}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/5 flex flex-col gap-3">
                      <div className="text-[10px] font-black text-white/30 uppercase tracking-widest">Voice Comms</div>
                      <button 
                        onClick={() => {
                          const enabled = !chatSettings.voiceEnabled;
                          setChatSettings(prev => ({ ...prev, voiceEnabled: enabled }));
                          if (enabled) startVoice();
                        }}
                        className={`w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${chatSettings.voiceEnabled ? 'bg-emerald-500 text-black' : 'bg-white/5 text-white/40'}`}
                      >
                        {chatSettings.voiceEnabled ? 'ENABLED' : 'DISABLED'}
                      </button>
                    </div>
                  </div>

                  {/* Mute List */}
                  {matchRoom && (
                    <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-4">
                      <div className="text-[10px] font-black text-white/30 uppercase tracking-widest">Mute Players</div>
                      <div className="space-y-2">
                        {matchRoom.players.filter((p: any) => p.id !== socket?.id).map((p: any) => (
                          <div key={p.id} className="flex items-center justify-between bg-black/20 p-3 rounded-xl">
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${p.team === 'blue' ? 'bg-blue-500' : 'bg-red-500'}`} />
                              <span className="text-xs font-bold text-white/80">{p.name}</span>
                            </div>
                            <button 
                              onClick={() => toggleMute(p.id)}
                              className={`px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${chatSettings.mutedPlayers.includes(p.id) ? 'bg-red-500 text-white' : 'bg-white/10 text-white/40'}`}
                            >
                              {chatSettings.mutedPlayers.includes(p.id) ? 'MUTED' : 'MUTE'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white/5 p-6 rounded-[2rem] border border-white/5 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-black text-white/30 uppercase tracking-widest">Platform</div>
                      <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                    </div>
                    <div className="text-xl font-black text-white uppercase italic">Mobile Mode</div>
                    <button 
                      onClick={() => {
                        const newVal = !isMobile;
                        setIsMobile(newVal);
                        gameRef.current?.setMobile(newVal);
                      }}
                      className={`w-full py-4 rounded-xl font-black text-xs transition-all ${isMobile ? 'bg-emerald-500 text-black shadow-lg' : 'bg-white/10 text-white/40 hover:text-white'}`}
                    >
                      {isMobile ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>

                  <div className="bg-white/5 p-6 rounded-[2rem] border border-white/5 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-black text-white/30 uppercase tracking-widest">Graphics</div>
                      <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                    </div>
                    <div className="text-xl font-black text-white uppercase italic">Render Quality</div>
                    <div className="w-full py-4 bg-white/5 rounded-xl text-center text-[10px] font-black text-white/40 uppercase tracking-widest">
                      High Performance
                    </div>
                  </div>

                  <div className="bg-white/5 p-6 rounded-[2rem] border border-white/5 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-black text-white/30 uppercase tracking-widest">System</div>
                      <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                    </div>
                    <div className="text-xl font-black text-white uppercase italic">Reset Data</div>
                    <button 
                      onClick={() => {
                        if (resetConfirm) {
                          localStorage.removeItem('polyDodge_profile');
                          localStorage.removeItem('polyDodge_unlocked');
                          localStorage.removeItem('polyDodge_selectedBall');
                          localStorage.removeItem('polyDodge_selectedEmote');
                          localStorage.removeItem('polyDodge_sensitivity');
                          localStorage.removeItem('polyDodge_chatSettings');
                          window.location.reload();
                        } else {
                          setResetConfirm(true);
                          setTimeout(() => setResetConfirm(false), 3000);
                        }
                      }}
                      className={`w-full py-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border relative z-50 cursor-pointer ${
                        resetConfirm 
                          ? 'bg-red-500 text-white border-red-600 animate-pulse' 
                          : 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border-red-500/20'
                      }`}
                    >
                      {resetConfirm ? 'CONFIRM RESET?' : 'FACTORY RESET'}
                    </button>
                  </div>
                </div>
              </div>

              <div className={`${isMobile && isLandscape ? 'p-4' : 'p-8'} bg-zinc-950/50 border-t border-white/5`}>
                <button 
                  onClick={() => setShowSettings(false)}
                  className={`w-full bg-white text-black ${isMobile && isLandscape ? 'py-3' : 'py-5'} rounded-2xl font-black uppercase tracking-[0.3em] hover:bg-emerald-400 transition-all active:scale-95 shadow-2xl ${isMobile && isLandscape ? 'text-[10px]' : ''}`}
                >
                  Apply & Synchronize
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* How to Play Modal */}
      <AnimatePresence>
        {showInstructions && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className={`w-full max-w-4xl bg-zinc-900 border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh] ${isMobile ? (isLandscape ? 'scale-[0.6] md:scale-100' : 'scale-[0.85] md:scale-100') : ''}`}
            >
              <div className={`${isMobile && isLandscape ? 'p-4' : 'p-12'} border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent flex justify-between items-end`}>
                <div>
                  <div className={`flex items-center gap-3 ${isMobile && isLandscape ? 'mb-2' : 'mb-4'}`}>
                    <div className="w-8 h-1 bg-amber-500" />
                    <span className="text-amber-500 font-black tracking-[0.4em] uppercase text-[10px]">Combat Training</span>
                  </div>
                  <h2 className={`${isMobile && isLandscape ? 'text-2xl' : 'text-5xl md:text-7xl'} font-black italic uppercase tracking-tighter text-white leading-none`}>
                    Field <span className="text-amber-500">Manual</span>
                  </h2>
                </div>
                <button 
                  onClick={() => setShowInstructions(false)}
                  className={`${isMobile && isLandscape ? 'w-10 h-10' : 'w-16 h-16'} rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all active:scale-90 group`}
                >
                  <X className={`${isMobile && isLandscape ? 'w-5 h-5' : 'w-8 h-8'} text-white/40 group-hover:text-white transition-colors`} />
                </button>
              </div>

              <div className={`flex-1 overflow-y-auto ${isMobile && isLandscape ? 'p-4' : 'p-12'} custom-scrollbar bg-zinc-950/20`}>
                <div className={`grid grid-cols-1 md:grid-cols-2 ${isMobile && isLandscape ? 'gap-6' : 'gap-12'}`}>
                  <section>
                    <h3 className={`text-amber-500 font-black uppercase tracking-[0.3em] text-[10px] ${isMobile && isLandscape ? 'mb-4' : 'mb-8'} flex items-center gap-3`}>
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      Core Mechanics
                    </h3>
                    <div className={`${isMobile && isLandscape ? 'space-y-3' : 'space-y-6'}`}>
                      {[
                        { title: 'Movement', desc: 'WASD or Joystick to navigate.', icon: Globe },
                        { title: 'Combat', desc: 'Left Click or Fire to throw.', icon: Target },
                        { title: 'Defense', desc: 'Right Click or Block to deflect.', icon: Shield },
                        { title: 'Recovery', desc: 'Walk over balls to replenish.', icon: Zap }
                      ].map((item, i) => (
                        <div key={i} className="flex gap-4 group">
                          <div className={`${isMobile && isLandscape ? 'w-8 h-8 rounded-xl' : 'w-12 h-12 rounded-2xl'} bg-white/5 flex items-center justify-center group-hover:bg-amber-500/10 transition-colors shrink-0`}>
                            <item.icon className={`${isMobile && isLandscape ? 'w-4 h-4' : 'w-6 h-6'} text-white/40 group-hover:text-amber-500 transition-colors`} />
                          </div>
                          <div>
                            <div className={`text-white font-black uppercase italic tracking-tight ${isMobile && isLandscape ? 'text-sm' : 'text-lg'} mb-0.5`}>{item.title}</div>
                            <div className="text-white/40 text-[10px] leading-tight">{item.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className={`text-emerald-500 font-black uppercase tracking-[0.3em] text-[10px] ${isMobile && isLandscape ? 'mb-4' : 'mb-8'} flex items-center gap-3`}>
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      Victory Conditions
                    </h3>
                    <div className={`bg-white/5 rounded-[2rem] ${isMobile && isLandscape ? 'p-4' : 'p-8'} border border-white/5 ${isMobile && isLandscape ? 'space-y-3' : 'space-y-6'}`}>
                      <div className="flex items-center gap-4">
                        <div className={`${isMobile && isLandscape ? 'w-8 h-8' : 'w-12 h-12'} rounded-full bg-emerald-500/10 flex items-center justify-center`}>
                          <Trophy className={`${isMobile && isLandscape ? 'w-4 h-4' : 'w-6 h-6'} text-emerald-500`} />
                        </div>
                        <div className={`text-white font-black uppercase italic tracking-tight ${isMobile && isLandscape ? 'text-base' : 'text-xl'}`}>Elimination</div>
                      </div>
                      <p className="text-white/40 text-[10px] leading-tight">
                        Eliminate the opposing team. A team wins when all enemy players are out.
                      </p>
                      <div className={`${isMobile && isLandscape ? 'pt-3' : 'pt-6'} border-t border-white/5`}>
                        <div className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-2">Match Format</div>
                        <div className="flex justify-between items-center">
                          <span className="text-white font-bold text-[10px]">First to 4 Rounds</span>
                          <span className="text-emerald-500 font-black font-mono text-[10px]">VICTORY</span>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              <div className={`${isMobile && isLandscape ? 'p-4' : 'p-8'} border-t border-white/5 bg-zinc-900 flex justify-center`}>
                <button 
                  onClick={() => setShowInstructions(false)}
                  className={`${isMobile && isLandscape ? 'px-8 py-3' : 'px-16 py-5'} bg-white text-black rounded-2xl font-black uppercase tracking-[0.4em] hover:bg-amber-500 transition-all active:scale-95 shadow-2xl ${isMobile && isLandscape ? 'text-xs' : ''}`}
                >
                  Understood
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Disconnected Popup */}
      <AnimatePresence>
        {isDisconnected && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
          >
            <div className="bg-zinc-900 border border-red-500/30 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <WifiOff className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-2xl font-black text-white mb-2 uppercase italic tracking-tighter">Connection Lost</h2>
              <p className="text-white/60 text-sm mb-8">You have been disconnected from the arena. Please check your connection.</p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => window.location.reload()}
                  className="w-full bg-white text-black font-black py-4 rounded-xl hover:bg-emerald-400 transition-colors uppercase tracking-widest text-xs"
                >
                  Reconnect
                </button>
                <button 
                  onClick={() => {
                    setIsDisconnected(true); // Keep it true but go to menu
                    setGameState('menu');
                    if (gameRef.current) gameRef.current.dispose();
                    gameRef.current = null;
                    setIsDisconnected(false);
                  }}
                  className="w-full bg-white/5 text-white font-black py-4 rounded-xl hover:bg-white/10 transition-colors uppercase tracking-widest text-xs"
                >
                  Back to Menu
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
