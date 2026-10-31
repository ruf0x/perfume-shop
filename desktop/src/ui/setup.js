'use strict'

// First-launch screen: the owner types the server address once; the app checks it answers like our server.
const form = document.getElementById('form')
const input = document.getElementById('url')
const error = document.getElementById('error')
const submit = document.getElementById('submit')

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  error.hidden = true
  submit.disabled = true
  submit.textContent = 'Vérification…'

  const result = await window.desktop.setServer(input.value)

  // On success the app opens the admin by itself; this page is replaced.
  if (!result.ok) {
    error.textContent = result.error
    error.hidden = false
    submit.disabled = false
    submit.textContent = 'Continuer'
    input.focus()
  }
})
