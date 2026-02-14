/**
 * 语音输入模块 — 基于 Web Speech API
 * 为 textarea / input 注入麦克风按钮，点击后语音转文字
 */
class VoiceInput {
  constructor() {
    this.recognition = null
    this.isListening = false
    this.currentTarget = null
    this.currentBtn = null
    this._insertPos = 0 // 开始录音时光标位置
    this._interimText = '' // 临时识别文本
    this.init()
  }

  init() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      console.warn('语音输入不可用：浏览器不支持 Web Speech API')
      return
    }
    this.recognition = new SR()
    this.recognition.lang = 'zh-CN'
    this.recognition.continuous = true
    this.recognition.interimResults = true

    this.recognition.onresult = (e) => this.handleResult(e)
    this.recognition.onend = () => this.handleEnd()
    this.recognition.onerror = (e) => this.handleError(e)
  }

  toggle(targetEl, btnEl) {
    if (this.isListening && this.currentTarget === targetEl) {
      this.stop()
    } else {
      // 如果正在对另一个元素录音，先停掉
      if (this.isListening) this.stop()
      this.start(targetEl, btnEl)
    }
  }

  start(targetEl, btnEl) {
    if (!this.recognition) return
    this.currentTarget = targetEl
    this.currentBtn = btnEl
    this.isListening = true
    this._interimText = ''

    // 记录光标位置（textarea 用 selectionEnd，input 同理）
    const pos = targetEl.selectionEnd
    this._insertPos = (pos != null) ? pos : targetEl.value.length

    // 如果已有内容且插入位置在末尾，且末尾不是空白，加一个空格
    if (this._insertPos === targetEl.value.length && targetEl.value.length > 0) {
      const last = targetEl.value[targetEl.value.length - 1]
      if (last !== ' ' && last !== '\n' && last !== '\t') {
        targetEl.value += ' '
        this._insertPos = targetEl.value.length
      }
    }

    btnEl.classList.add('voice-btn--active')
    btnEl.title = '停止语音输入'

    try {
      this.recognition.start()
    } catch (e) {
      // 可能已经在运行
      console.warn('recognition.start():', e.message)
    }
  }

  stop() {
    this.isListening = false
    if (this.recognition) {
      try { this.recognition.stop() } catch (_) {}
    }
    this._cleanupBtn()
  }

  _cleanupBtn() {
    if (this.currentBtn) {
      this.currentBtn.classList.remove('voice-btn--active')
      this.currentBtn.title = '语音输入'
    }
  }

  handleResult(event) {
    if (!this.currentTarget) return

    let finalText = ''
    let interimText = ''

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript
      if (event.results[i].isFinal) {
        finalText += transcript
      } else {
        interimText += transcript
      }
    }

    const el = this.currentTarget

    // 先移除上一次的临时文本
    if (this._interimText) {
      const before = el.value.substring(0, el.value.length - this._interimText.length)
      el.value = before
    }

    // 追加 final 文本
    if (finalText) {
      el.value += finalText
      this._interimText = ''
    }

    // 追加 interim 文本（下次会被替换）
    if (interimText) {
      el.value += interimText
      this._interimText = interimText
    } else if (!finalText) {
      this._interimText = ''
    }

    // 滚动到底部 & 触发 input 事件
    el.scrollTop = el.scrollHeight
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }

  handleEnd() {
    if (this.isListening) {
      // 意外中断（静默超时等），自动重启
      try { this.recognition.start() } catch (_) {}
    } else {
      this._cleanupBtn()
      this.currentTarget = null
      this.currentBtn = null
      this._interimText = ''
    }
  }

  handleError(event) {
    switch (event.error) {
      case 'no-speech':
        // 静默忽略
        break
      case 'audio-capture':
        console.warn('语音输入：未检测到麦克风')
        this.stop()
        break
      case 'not-allowed':
        console.warn('语音输入：麦克风权限被拒绝')
        this.stop()
        break
      default:
        console.warn('语音输入错误:', event.error)
    }
  }

  /**
   * 给指定元素旁边注入麦克风按钮
   * @param {string} elementId - textarea 或 input 的 id
   */
  attachTo(elementId) {
    const el = document.getElementById(elementId)
    if (!el) return

    const btn = document.createElement('button')
    btn.className = 'voice-btn'
    btn.type = 'button'
    btn.title = '语音输入'
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="1" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/></svg>'

    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.toggle(el, btn)
    })

    // birdChatInput 是 input，在 flex 行内，用 inline 方式
    if (el.tagName === 'INPUT') {
      btn.classList.add('voice-btn--inline')
      // 插入到 input 后面（同级）
      el.parentElement.insertBefore(btn, el.nextSibling)
    } else {
      // textarea：absolute 定位在右下角
      const wrapper = el.parentElement
      wrapper.style.position = 'relative'
      wrapper.appendChild(btn)
    }
  }
}

// ========== 初始化 ==========
window.voiceInput = null

function initVoiceInput() {
  const vi = new VoiceInput()
  if (!vi.recognition) return

  vi.attachTo('journalEditor')
  vi.attachTo('inspirationInput')
  vi.attachTo('writingEditor')
  vi.attachTo('dreamContent')
  vi.attachTo('chapterOutline')
  vi.attachTo('chapterNotes')
  vi.attachTo('birdChatInput')

  window.voiceInput = vi
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVoiceInput)
} else {
  initVoiceInput()
}
