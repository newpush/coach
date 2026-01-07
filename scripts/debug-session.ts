import { $fetch } from 'ofetch'

async function checkSession() {
  try {
    const response = await $fetch('http://localhost:3000/api/auth/session')
    console.log('Session response:', response)
  } catch (error) {
    console.error('Error fetching session:', error)
  }
}

checkSession()
