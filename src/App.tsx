import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type GameId = 'animals' | 'shapes' | 'colors' | 'emotions'
type Screen = 'welcome' | 'home' | GameId
type Settings = {
  masterVolume: number
  voice: boolean
  music: boolean
  effects: boolean
  breakReminder: boolean
}

const defaultSettings: Settings = {
  masterVolume: 0.7,
  voice: true,
  music: true,
  effects: true,
  breakReminder: true,
}

const defaultProgress: Record<GameId, number> = {
  animals: 0,
  shapes: 0,
  colors: 0,
  emotions: 0,
}

function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key)
      return saved ? (JSON.parse(saved) as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])

  return [value, setValue] as const
}

function useAudio(settings: Settings) {
  const audioContext = useRef<AudioContext | null>(null)
  const voiceAudio = useRef<HTMLAudioElement | null>(null)
  const animalAudio = useRef<HTMLAudioElement | null>(null)
  const finishAnimal = useRef<((completed: boolean) => void) | null>(null)

  const ensureContext = useCallback(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!audioContext.current && AudioContextClass) audioContext.current = new AudioContextClass()
    if (audioContext.current?.state === 'suspended') void audioContext.current.resume()
    return audioContext.current
  }, [])

  const tone = useCallback((frequency: number, duration = 0.12, delay = 0, volume = 0.08) => {
    if (!settings.effects) return
    const context = ensureContext()
    if (!context) return
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const start = context.currentTime + delay
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, start)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * settings.masterVolume), start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  }, [ensureContext, settings.effects, settings.masterVolume])

  const sfx = useCallback((kind: 'pop' | 'success' | 'ting'): number => {
    if (!settings.effects) return 0
    if (kind === 'pop') {
      tone(480, 0.09, 0, 0.05)
      return 110
    }
    if (kind === 'ting') {
      tone(740, 0.15, 0, 0.07)
      tone(980, 0.18, 0.1, 0.06)
      return 300
    }
    tone(523, 0.18, 0, 0.07)
    tone(659, 0.18, 0.13, 0.07)
    tone(784, 0.26, 0.26, 0.08)
    return 540
  }, [settings.effects, tone])

  const musicNote = useCallback((frequency: number) => {
    if (!settings.music) return
    const context = ensureContext()
    if (!context) return
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const now = context.currentTime
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, now)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.018 * settings.masterVolume), now + 0.3)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.35)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + 1.4)
  }, [ensureContext, settings.masterVolume, settings.music])

  const stopVoice = useCallback(() => {
    const recording = voiceAudio.current
    if (!recording) return
    recording.pause()
    recording.currentTime = 0
    voiceAudio.current = null
  }, [])

  const stopAnimal = useCallback(() => {
    const recording = animalAudio.current
    animalAudio.current = null
    const finish = finishAnimal.current
    finishAnimal.current = null
    recording?.pause()
    if (recording) recording.currentTime = 0
    finish?.(false)
  }, [])

  const speak = useCallback((text: string) => {
    stopVoice()
    stopAnimal()
    if (!settings.voice) return
    const recording = new Audio(`/audio/${voiceKey(text)}.wav`)
    recording.volume = settings.masterVolume
    voiceAudio.current = recording
    void recording.play().catch(() => undefined)
  }, [settings.masterVolume, settings.voice, stopAnimal, stopVoice])

  const playAnimal = useCallback((source: string, volumeBoost = 1): Promise<boolean> => {
    stopVoice()
    stopAnimal()
    const recording = new Audio(source)
    recording.volume = settings.masterVolume
    animalAudio.current = recording
    let mediaSource: MediaElementAudioSourceNode | null = null
    let volumeGain: GainNode | null = null

    if (volumeBoost > 1) {
      const context = ensureContext()
      if (context) {
        mediaSource = context.createMediaElementSource(recording)
        volumeGain = context.createGain()
        volumeGain.gain.setValueAtTime(volumeBoost, context.currentTime)
        mediaSource.connect(volumeGain).connect(context.destination)
      } else {
        recording.volume = Math.min(1, settings.masterVolume * volumeBoost)
      }
    }

    return new Promise((resolve) => {
      let settled = false
      const finish = (completed: boolean) => {
        if (settled) return
        settled = true
        recording.onended = null
        recording.onerror = null
        mediaSource?.disconnect()
        volumeGain?.disconnect()
        if (animalAudio.current === recording) animalAudio.current = null
        if (finishAnimal.current === finish) finishAnimal.current = null
        resolve(completed)
      }
      finishAnimal.current = finish
      recording.onended = () => finish(true)
      recording.onerror = () => finish(false)
      void recording.play().catch(() => finish(false))
    })
  }, [ensureContext, settings.masterVolume, stopAnimal, stopVoice])

  const stop = useCallback(() => {
    stopVoice()
    stopAnimal()
  }, [stopAnimal, stopVoice])

  const correct = useCallback(() => {
    stop()
    return sfx('ting')
  }, [sfx, stop])

  return useMemo(
    () => ({ ensureContext, musicNote, sfx, speak, playAnimal, stop, correct }),
    [correct, ensureContext, musicNote, playAnimal, sfx, speak, stop],
  )
}

function voiceKey(text: string) {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

const gameCards: Array<{ id: GameId; icon: string; className: string; label: string }> = [
  { id: 'animals', icon: '🐶', className: 'animal-zone', label: 'Tiếng Ai Gọi Đó' },
  { id: 'colors', icon: '🎨', className: 'color-zone', label: 'Thế Giới Rực Rỡ' },
  { id: 'shapes', icon: '⭐', className: 'shape-zone', label: 'Khéo Tay Bỏ Thùng' },
  { id: 'emotions', icon: '😊', className: 'emotion-zone', label: 'Gương Mặt Kỳ Diệu' },
]

export default function App() {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [settings, setSettings] = useStoredState<Settings>('tiny-settings', defaultSettings)
  const [progress, setProgress] = useStoredState<Record<GameId, number>>('tiny-progress', defaultProgress)
  const [parentOpen, setParentOpen] = useState(false)
  const [showBreak, setShowBreak] = useState(false)
  const audio = useAudio(settings)
  const musicNote = audio.musicNote

  useEffect(() => {
    if (!settings.breakReminder || screen === 'welcome') return
    const timer = window.setTimeout(() => setShowBreak(true), 15 * 60 * 1000)
    return () => window.clearTimeout(timer)
  }, [screen, settings.breakReminder])

  useEffect(() => {
    if (!settings.music || screen === 'welcome') return
    const notes = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23]
    let index = 0
    const play = () => { musicNote(notes[index % notes.length]); index += 1 }
    play()
    const timer = window.setInterval(play, 1450)
    return () => window.clearInterval(timer)
  }, [musicNote, screen, settings.music])

  const begin = () => {
    audio.ensureContext()
    audio.sfx('success')
    setScreen('home')
    window.setTimeout(() => audio.speak('Chào mừng bé đến với khu vườn khám phá!'), 350)
  }

  const openGame = (id: GameId) => {
    audio.sfx('pop')
    setScreen(id)
  }

  const goHome = () => {
    audio.stop()
    audio.sfx('pop')
    setScreen('home')
  }

  const markComplete = useCallback((id: GameId, round: number) => {
    setProgress((current) => ({ ...current, [id]: Math.max(current[id], Math.min(8, round)) }))
  }, [setProgress])

  return (
    <main className={`app screen-${screen}`}>
      <div className="sky-decor" aria-hidden="true">
        <span className="cloud cloud-one">☁</span><span className="cloud cloud-two">☁</span>
      </div>

      {screen === 'welcome' && <Welcome onBegin={begin} />}
      {screen === 'home' && (
        <Home
          progress={progress}
          onOpen={openGame}
          onParent={() => setParentOpen(true)}
          effectsEnabled={settings.effects}
          onToggleEffects={() => setSettings((s) => ({ ...s, effects: !s.effects }))}
        />
      )}
      {screen === 'animals' && <AnimalGame audio={audio} onHome={goHome} onProgress={(n) => markComplete('animals', n)} />}
      {screen === 'shapes' && <ShapeGame audio={audio} onHome={goHome} onProgress={(n) => markComplete('shapes', n)} />}
      {screen === 'colors' && <ColorGame audio={audio} onHome={goHome} onProgress={(n) => markComplete('colors', n)} />}
      {screen === 'emotions' && <EmotionGame audio={audio} onHome={goHome} onProgress={(n) => markComplete('emotions', n)} />}

      {parentOpen && (
        <ParentArea
          settings={settings}
          progress={progress}
          onSettings={setSettings}
          onReset={() => setProgress(defaultProgress)}
          onClose={() => setParentOpen(false)}
        />
      )}
      {showBreak && <BreakReminder onClose={() => setShowBreak(false)} />}
    </main>
  )
}

function Welcome({ onBegin }: { onBegin: () => void }) {
  return (
    <section className="welcome scene" aria-label="Bắt đầu">
      <div className="sun" aria-hidden="true">☀</div>
      <div className="welcome-mascot" aria-hidden="true">
        <span className="ear left"/><span className="ear right"/>
        <span className="bear-face"><i/><i/><b/></span>
        <span className="wave">👋</span>
      </div>
      <button className="start-button tactile" onClick={onBegin} aria-label="Chạm để bắt đầu">
        <span aria-hidden="true">▶</span>
      </button>
      <div className="garden-ground" aria-hidden="true"><span>🌼</span><span>🌷</span><span>🌼</span></div>
    </section>
  )
}

function Home({ progress, onOpen, onParent, effectsEnabled, onToggleEffects }: {
  progress: Record<GameId, number>
  onOpen: (id: GameId) => void
  onParent: () => void
  effectsEnabled: boolean
  onToggleEffects: () => void
}) {
  return (
    <section className="home scene" aria-label="Khu vườn khám phá">
      <header className="top-controls">
        <button className="round-control tactile" onClick={onToggleEffects} aria-label={effectsEnabled ? 'Tắt hiệu ứng âm thanh' : 'Bật hiệu ứng âm thanh'}>
          <span aria-hidden="true">{effectsEnabled ? '🔊' : '🔇'}</span>
        </button>
        <button className="round-control tactile parent-button" onClick={onParent} aria-label="Khu vực phụ huynh">
          <span aria-hidden="true">🔒</span>
        </button>
      </header>
      <div className="home-mascot" aria-hidden="true">🐻</div>
      <div className="game-grid">
        {gameCards.map((game, index) => (
          <button
            key={game.id}
            className={`game-card tactile ${game.className}`}
            onClick={() => onOpen(game.id)}
            aria-label={game.label}
            style={{ '--delay': `${index * 0.25}s` } as React.CSSProperties}
          >
            <span className="zone-roof" aria-hidden="true" />
            <span className="game-icon" aria-hidden="true">{game.icon}</span>
            <span className="badge-row" aria-label={`Đã hoàn thành ${progress[game.id]} trên 8 lượt`}>
              {Array.from({ length: 3 }, (_, i) => <span key={i} className={progress[game.id] >= (i + 1) * 2 ? 'earned' : ''}>★</span>)}
            </span>
          </button>
        ))}
      </div>
      <div className="garden-ground home-ground" aria-hidden="true"><span>🌿</span><span>🌼</span><span>🌳</span><span>🌷</span><span>🌿</span></div>
    </section>
  )
}

type AudioControls = ReturnType<typeof useAudio>

function GameHeader({ onHome, onReplay }: { onHome: () => void; onReplay: () => void }) {
  return (
    <header className="game-header">
      <button className="round-control tactile" onClick={onHome} aria-label="Về khu vườn"><span aria-hidden="true">🏡</span></button>
      <button className="round-control tactile speaker-button" onClick={onReplay} aria-label="Nghe lại"><span aria-hidden="true">🔊</span></button>
    </header>
  )
}

function Feedback({ success, icon = '⭐' }: { success: boolean; icon?: string }) {
  return (
    <div className={success ? 'feedback success' : 'feedback gentle'} aria-hidden="true">
      {success ? Array.from({ length: 10 }, (_, i) => <span key={i} style={{ '--i': i } as React.CSSProperties}>{i % 2 ? '●' : icon}</span>) : <span>💭</span>}
    </div>
  )
}

const animalRounds = [
  { name: 'chó', audio: '/audio/animals/dog.ogg', icon: '🐶', volumeBoost: 1 }, { name: 'mèo', audio: '/audio/animals/cat.ogg', icon: '🐱', volumeBoost: 1 },
  { name: 'vịt', audio: '/audio/animals/duck.mp3', icon: '🦆', volumeBoost: 1 }, { name: 'bò', audio: '/audio/animals/cow.ogg', icon: '🐮', volumeBoost: 1 },
  { name: 'voi', audio: '/audio/animals/elephant.ogg', icon: '🐘', volumeBoost: 1 }, { name: 'gà', audio: '/audio/animals/chicken.oga', icon: '🐔', volumeBoost: 1 },
  { name: 'cừu', audio: '/audio/animals/sheep.ogg', icon: '🐑', volumeBoost: 1 }, { name: 'ếch', audio: '/audio/animals/frog.mp3', icon: '🐸', volumeBoost: 1.35 },
]

function AnimalGame({ audio, onHome, onProgress }: { audio: AudioControls; onHome: () => void; onProgress: (n: number) => void }) {
  const [round, setRound] = useState(0)
  const [wrong, setWrong] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const target = animalRounds[round % animalRounds.length]
  const choices = useMemo(() => {
    const other = animalRounds.filter((a) => a.name !== target.name)
    const offset = (round * 2) % other.length
    return [target, other[offset], other[(offset + 2) % other.length], other[(offset + 4) % other.length]].sort((a, b) => (a.name.charCodeAt(0) + round) % 5 - (b.name.charCodeAt(0) + round) % 5)
  }, [round, target])

  const ask = useCallback(async () => {
    const heard = await audio.playAnimal(target.audio, target.volumeBoost)
    if (heard) audio.speak('Bé tìm xem tiếng của bạn nào nhé!')
  }, [audio, target.audio, target.volumeBoost])
  useEffect(() => {
    if (success) return
    const id = window.setTimeout(ask, 450)
    return () => window.clearTimeout(id)
  }, [ask, success])

  const choose = (name: string) => {
    if (success) return
    if (name === target.name) {
      setSuccess(true)
      const feedbackDuration = audio.correct()
      onProgress(round + 1)
      window.setTimeout(() => { setSuccess(false); setWrong(null); setRound((r) => (r + 1) % 8) }, feedbackDuration)
    } else {
      audio.sfx('pop')
      setWrong(name)
      audio.speak('Bạn này cũng đáng yêu quá. Bé nghe lại nhé!')
      window.setTimeout(() => setWrong(null), 650)
    }
  }

  return (
    <section className="game animal-game scene">
      <GameHeader onHome={onHome} onReplay={ask} />
      <button className="sound-orb tactile" onClick={ask} aria-label="Nghe tiếng con vật"><span>🔊</span><i/><i/><i/></button>
      <div className="animal-choices">
        {choices.map((animal) => (
          <button key={animal.name} className={`animal-card tactile ${wrong === animal.name ? 'is-wrong' : ''} ${success && animal.name === target.name ? 'is-correct' : ''}`} onClick={() => choose(animal.name)} aria-label={`Con ${animal.name}`}>
            <span aria-hidden="true">{animal.icon}</span>
          </button>
        ))}
      </div>
      {wrong && <Feedback success={false} />}{success && <Feedback success />}
      <RoundDots current={round} />
    </section>
  )
}

const shapes = [
  { id: 'circle', symbol: '●', color: '#e38b78' },
  { id: 'square', symbol: '■', color: '#78a9c2' },
  { id: 'triangle', symbol: '▲', color: '#e4b85f' },
  { id: 'star', symbol: '★', color: '#9cad83' },
]
const shapeLabels: Record<string, string> = { circle: 'hình tròn', square: 'hình vuông', triangle: 'hình tam giác', star: 'hình ngôi sao' }

function ShapeGame({ audio, onHome, onProgress }: { audio: AudioControls; onHome: () => void; onProgress: (n: number) => void }) {
  const [round, setRound] = useState(0)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [wrong, setWrong] = useState(false)
  const [success, setSuccess] = useState(false)
  const target = shapes[round % shapes.length]
  const bins = useMemo(() => [target, shapes[(round + 1) % 4], shapes[(round + 2) % 4]].sort((a, b) => (a.id.length + round) % 3 - (b.id.length + round) % 3), [round, target])
  const ask = useCallback(() => audio.speak(`Bé kéo ${shapeLabels[target.id]} vào chiếc hộp giống nó nhé!`), [audio, target.id])
  useEffect(() => {
    if (success) return
    const id = window.setTimeout(ask, 400)
    return () => window.clearTimeout(id)
  }, [ask, success])

  const completeDrop = (clientX: number, clientY: number) => {
    if (success) return
    const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    const bin = element?.closest<HTMLElement>('[data-bin]')
    setDrag(null)
    if (bin?.dataset.bin === target.id) {
      setSuccess(true)
      const feedbackDuration = audio.correct()
      onProgress(round + 1)
      window.setTimeout(() => { setSuccess(false); setRound((r) => (r + 1) % 8) }, feedbackDuration)
    } else {
      setWrong(true)
      audio.speak('Thử lại lần nữa nào!')
      window.setTimeout(() => setWrong(false), 650)
    }
  }

  return (
    <section className="game shape-game scene">
      <GameHeader onHome={onHome} onReplay={ask} />
      <div className={`shape-stage ${wrong ? 'is-wrong' : ''}`}>
        {!drag && !success && (
          <button
            className="draggable-shape tactile"
            style={{ color: target.color }}
            onPointerDown={(e) => { audio.sfx('pop'); e.currentTarget.setPointerCapture(e.pointerId); setDrag({ x: e.clientX, y: e.clientY }) }}
            onPointerMove={(e) => { if (drag) setDrag({ x: e.clientX, y: e.clientY }) }}
            onPointerUp={(e) => completeDrop(e.clientX, e.clientY)}
            aria-label={`Kéo ${shapeLabels[target.id]}`}
          >{target.symbol}</button>
        )}
        {success && <span className="shape-gone" aria-hidden="true">✨</span>}
      </div>
      {drag && <div className="drag-ghost" style={{ left: drag.x, top: drag.y, color: target.color }}>{target.symbol}</div>}
      <div className="shape-bins">
        {bins.map((shape) => (
          <button key={shape.id} data-bin={shape.id} className={`shape-bin tactile ${drag && shape.id === target.id ? 'hint' : ''}`} onPointerUp={(e) => completeDrop(e.clientX, e.clientY)} aria-label={`Hộp ${shapeLabels[shape.id]}`}>
            <span className="bin-slot" style={{ color: shape.color }}>{shape.symbol}</span><span className="bin-body">▰</span>
          </button>
        ))}
      </div>
      {wrong && <Feedback success={false} />}{success && <Feedback success />}
      <RoundDots current={round} />
    </section>
  )
}

const palette = [
  { id: 'red', label: 'đỏ', hex: '#dc8074' }, { id: 'yellow', label: 'vàng', hex: '#e5bb5f' },
  { id: 'blue', label: 'xanh dương', hex: '#75a9c5' }, { id: 'green', label: 'xanh lá', hex: '#91aa7b' },
]
const colorRounds = [
  { art: '🌸', color: 0 }, { art: '🎈', color: 1 }, { art: '🐟', color: 2 }, { art: '🚗', color: 3 },
  { art: '☂️', color: 2 }, { art: '🍎', color: 0 }, { art: '⭐', color: 1 }, { art: '🦋', color: 3 },
]

function ColorGame({ audio, onHome, onProgress }: { audio: AudioControls; onHome: () => void; onProgress: (n: number) => void }) {
  const [round, setRound] = useState(0)
  const [painted, setPainted] = useState<string | null>(null)
  const [wrong, setWrong] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const item = colorRounds[round]
  const target = palette[item.color]
  const ask = useCallback(() => audio.speak(`Bé hãy chọn màu ${target.label} nhé!`), [audio, target.label])
  useEffect(() => {
    if (success) return
    const id = window.setTimeout(ask, 400)
    return () => window.clearTimeout(id)
  }, [ask, success])

  const choose = (color: typeof palette[number]) => {
    if (success) return
    setPainted(color.hex)
    if (color.id === target.id) {
      setSuccess(true)
      const feedbackDuration = audio.correct()
      onProgress(round + 1)
      window.setTimeout(() => { setSuccess(false); setPainted(null); setRound((r) => (r + 1) % 8) }, feedbackDuration)
    } else {
      audio.sfx('pop')
      setWrong(color.id)
      audio.speak('Ồ, màu này cũng đẹp. Bé thử lại nhé!')
      window.setTimeout(() => { setWrong(null); setPainted(null) }, 900)
    }
  }

  return (
    <section className="game color-game scene">
      <GameHeader onHome={onHome} onReplay={ask} />
      <div className="canvas-board">
        <div className="art-backdrop" style={{ '--paint': painted ?? '#f3eee5' } as React.CSSProperties}>
          <span className={success ? 'paint-pop' : ''}>{item.art}</span>
        </div>
      </div>
      <div className="paint-palette">
        {palette.map((color) => (
          <button key={color.id} className={`paint-pot tactile ${wrong === color.id ? 'is-wrong' : ''} ${color.id === target.id ? 'soft-hint' : ''}`} onClick={() => choose(color)} aria-label={`Màu ${color.label}`}>
            <span style={{ background: color.hex }} aria-hidden="true"/><i aria-hidden="true">🖌️</i>
          </button>
        ))}
      </div>
      {wrong && <Feedback success={false} />}{success && <Feedback success icon="●" />}
      <RoundDots current={round} />
    </section>
  )
}

type Emotion = 'happy' | 'sad' | 'surprised' | 'angry'
const emotionData: Array<{ id: Emotion; label: string; eyes: string; mouth: string; friend: string }> = [
  { id: 'happy', label: 'vui', eyes: '⌒ ⌒', mouth: '◡', friend: '🐻' },
  { id: 'sad', label: 'buồn', eyes: '︵ ︵', mouth: '⌢', friend: '🐰' },
  { id: 'surprised', label: 'ngạc nhiên', eyes: '● ●', mouth: '○', friend: '🐱' },
  { id: 'angry', label: 'tức giận', eyes: '⌄ ⌄', mouth: '﹏', friend: '🐘' },
]
const emotionRounds: Emotion[] = ['happy', 'sad', 'surprised', 'angry', 'happy', 'surprised', 'sad', 'angry']

function EmotionGame({ audio, onHome, onProgress }: { audio: AudioControls; onHome: () => void; onProgress: (n: number) => void }) {
  const [round, setRound] = useState(0)
  const [eyes, setEyes] = useState<Emotion | null>(null)
  const [mouth, setMouth] = useState<Emotion | null>(null)
  const [wrong, setWrong] = useState(false)
  const [success, setSuccess] = useState(false)
  const target = emotionData.find((e) => e.id === emotionRounds[round])!
  const selectedEyes = emotionData.find((e) => e.id === eyes)
  const selectedMouth = emotionData.find((e) => e.id === mouth)
  const ask = useCallback(() => audio.speak(`Bạn nhỏ đang rất ${target.label}. Bé ghép khuôn mặt cho bạn nào!`), [audio, target.label])
  useEffect(() => {
    if (success) return
    const id = window.setTimeout(ask, 400)
    return () => window.clearTimeout(id)
  }, [ask, success])

  const choosePart = (part: 'eyes' | 'mouth', emotion: Emotion) => {
    if (success || wrong) return
    audio.sfx('pop')
    const nextEyes = part === 'eyes' ? emotion : eyes
    const nextMouth = part === 'mouth' ? emotion : mouth
    if (part === 'eyes') setEyes(emotion)
    else setMouth(emotion)
    if (!nextEyes || !nextMouth) return
    if (nextEyes === target.id && nextMouth === target.id) {
      setSuccess(true)
      const feedbackDuration = audio.correct()
      onProgress(round + 1)
      window.setTimeout(() => { setSuccess(false); setEyes(null); setMouth(null); setRound((r) => (r + 1) % 8) }, feedbackDuration)
      return
    }
    setWrong(true)
    audio.speak('Gần đúng rồi. Bé thử ghép lại nhé!')
    window.setTimeout(() => { setWrong(false); setEyes(null); setMouth(null) }, 850)
  }

  return (
    <section className="game emotion-game scene">
      <GameHeader onHome={onHome} onReplay={ask} />
      <div className={`emotion-face ${wrong ? 'is-wrong' : ''} ${success ? 'celebrate' : ''}`}>
        <span className="friend-marker" aria-hidden="true">{target.friend}</span>
        <span className="face-eyes">{selectedEyes?.eyes ?? '·  ·'}</span>
        <span className="face-mouth">{selectedMouth?.mouth ?? '·'}</span>
      </div>
      <div className="emotion-pieces eyes-pieces">
        {emotionData.map((emotion) => (
          <button key={emotion.id} className={`emotion-piece tactile ${eyes === emotion.id ? 'selected' : ''}`} onClick={() => choosePart('eyes', emotion.id)} aria-label={`Đôi mắt ${emotion.label}`}><span>{emotion.eyes}</span></button>
        ))}
      </div>
      <div className="emotion-pieces mouth-pieces">
        {emotionData.map((emotion) => (
          <button key={emotion.id} className={`emotion-piece tactile ${mouth === emotion.id ? 'selected' : ''}`} onClick={() => choosePart('mouth', emotion.id)} aria-label={`Miệng ${emotion.label}`}><span>{emotion.mouth}</span></button>
        ))}
      </div>
      {wrong && <Feedback success={false} />}{success && <Feedback success icon="♥" />}
      <RoundDots current={round} />
    </section>
  )
}

function RoundDots({ current }: { current: number }) {
  return <div className="round-dots" aria-label={`Lượt ${current + 1} trên 8`}>{Array.from({ length: 8 }, (_, i) => <i key={i} className={i <= current ? 'done' : ''}/>)}</div>
}

function ParentArea({ settings, progress, onSettings, onReset, onClose }: {
  settings: Settings
  progress: Record<GameId, number>
  onSettings: React.Dispatch<React.SetStateAction<Settings>>
  onReset: () => void
  onClose: () => void
}) {
  const [unlocked, setUnlocked] = useState(false)
  const [holding, setHolding] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const timer = useRef<number | null>(null)

  const beginHold = () => {
    setHolding(true)
    timer.current = window.setTimeout(() => { setUnlocked(true); setHolding(false) }, 3000)
  }
  const cancelHold = () => {
    setHolding(false)
    if (timer.current) window.clearTimeout(timer.current)
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Khu vực phụ huynh">
      {!unlocked ? (
        <div className="parent-gate modal-card">
          <button className="modal-close" onClick={onClose} aria-label="Đóng">×</button>
          <div className="gate-lock">🔒</div>
          <h2>Dành cho phụ huynh</h2>
          <p>Nhấn và giữ nút bên dưới trong 3 giây.</p>
          <button
            className={`hold-button ${holding ? 'holding' : ''}`}
            onPointerDown={beginHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
          ><span>Giữ để mở</span><i/></button>
        </div>
      ) : (
        <div className="parent-panel modal-card">
          <button className="modal-close" onClick={onClose} aria-label="Đóng">×</button>
          <h2>Góc phụ huynh</h2>
          <p className="privacy-note">🔐 Mọi cài đặt và tiến độ chỉ được lưu trên thiết bị này.</p>
          <div className="setting-row volume-row">
            <label htmlFor="volume">Âm lượng</label>
            <input id="volume" type="range" min="0" max="1" step="0.1" value={settings.masterVolume} onChange={(e) => onSettings((s) => ({ ...s, masterVolume: Number(e.target.value) }))}/>
          </div>
          <Toggle label="Giọng hướng dẫn" value={settings.voice} onChange={(value) => onSettings((s) => ({ ...s, voice: value }))}/>
          <Toggle label="Nhạc nền" value={settings.music} onChange={(value) => onSettings((s) => ({ ...s, music: value }))}/>
          <Toggle label="Hiệu ứng âm thanh" value={settings.effects} onChange={(value) => onSettings((s) => ({ ...s, effects: value }))}/>
          <Toggle label="Nhắc nghỉ sau 15 phút" value={settings.breakReminder} onChange={(value) => onSettings((s) => ({ ...s, breakReminder: value }))}/>
          <h3>Tiến độ của bé</h3>
          <div className="progress-list">
            {gameCards.map((game) => <div key={game.id}><span>{game.icon} {game.label}</span><strong>{progress[game.id]}/8</strong></div>)}
          </div>
          {!confirmReset ? <button className="reset-button" onClick={() => setConfirmReset(true)}>Xóa toàn bộ tiến độ</button> : (
            <div className="reset-confirm"><p>Bạn chắc chắn muốn xóa tiến độ?</p><button onClick={() => { onReset(); setConfirmReset(false) }}>Đồng ý xóa</button><button onClick={() => setConfirmReset(false)}>Hủy</button></div>
          )}
        </div>
      )}
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <label className="setting-row toggle-row"><span>{label}</span><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)}/><i/></label>
}

function BreakReminder({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop break-backdrop" role="dialog" aria-modal="true">
      <div className="break-card modal-card"><div aria-hidden="true">🌙</div><h2>Mình nghỉ một chút nhé!</h2><p>Bé có thể nhìn ra xa, uống nước và vận động cùng gia đình.</p><button onClick={onClose}>Mình đã nghỉ rồi</button></div>
    </div>
  )
}
