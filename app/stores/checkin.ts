import { defineStore } from 'pinia'

export const useCheckinStore = defineStore('checkin', () => {
  const currentCheckin = ref<any>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isCompleted = computed(() => {
    if (!currentCheckin.value?.questions) return false
    const questions = currentCheckin.value.questions as any[]
    if (questions.length === 0) return false
    // Consider completed if at least one question is answered?
    // Or all? User said "When for that day the questions has been answered/saved"
    // Let's say if there are questions and they all have answers.
    return questions.every((q) => q.answer !== undefined && q.answer !== null)
  })

  async function fetchToday() {
    try {
      loading.value = true
      const data = await $fetch<any>('/api/checkin/today')
      currentCheckin.value = data
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  return {
    currentCheckin,
    loading,
    error,
    isCompleted,
    fetchToday
  }
})
