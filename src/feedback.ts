import './feedback.css'

type FeedbackResponse = {
  ok?: boolean
  error?: string
}

const form = document.querySelector<HTMLFormElement>('#feedback-form')
const statusEl = document.querySelector<HTMLElement>('#feedback-status')
const submitBtn = document.querySelector<HTMLButtonElement>('#feedback-submit')
const homeBtn = document.querySelector<HTMLAnchorElement>('#feedback-home')

const showStatus = (kind: 'ok' | 'err', message: string) => {
  if (!statusEl) {
    return
  }
  statusEl.hidden = false
  statusEl.classList.toggle('feedback-status--ok', kind === 'ok')
  statusEl.classList.toggle('feedback-status--err', kind === 'err')
  statusEl.textContent = message
}

const hideStatus = () => {
  if (!statusEl) {
    return
  }
  statusEl.hidden = true
  statusEl.textContent = ''
  statusEl.classList.remove('feedback-status--ok', 'feedback-status--err')
}

const readPayload = (target: HTMLFormElement) => {
  const data = new FormData(target)
  return {
    name: String(data.get('name') ?? '').trim(),
    email: String(data.get('email') ?? '').trim(),
    message: String(data.get('message') ?? '').trim(),
    rating: Number(data.get('rating')),
  }
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!form || !submitBtn) {
    return
  }

  const payload = readPayload(form)
  if (!payload.name || !payload.email || !payload.message || payload.rating < 1 || payload.rating > 5) {
    showStatus('err', 'Fill in every field, including a rating.')
    return
  }

  hideStatus()
  submitBtn.disabled = true
  submitBtn.textContent = 'Sending'

  try {
    const res = await fetch('/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    let body: FeedbackResponse = {}
    try {
      body = await res.json() as FeedbackResponse
    } catch {
      body = {}
    }

    if (!res.ok) {
      showStatus('err', body.error || 'Could not send. Try again in a bit.')
      return
    }

    form.hidden = true
    if (homeBtn) {
      homeBtn.hidden = false
    }
    showStatus('ok', 'Landed. If you left a real email, we can write back.')
  } catch {
    showStatus('err', 'Could not send. Try again in a bit.')
  } finally {
    if (!form.hidden) {
      submitBtn.disabled = false
      submitBtn.textContent = 'Send'
    }
  }
})
