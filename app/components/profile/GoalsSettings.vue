<template>
  <div class="space-y-6 animate-fade-in">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold flex items-center gap-2">
        <UIcon name="i-heroicons-trophy" class="w-5 h-5 text-primary" />
        Goals
      </h2>
      <UButton
        v-if="!showWizard"
        variant="soft"
        size="sm"
        icon="i-heroicons-plus"
        @click="showWizard = true"
      >
        Add Goal
      </UButton>
    </div>

    <div v-if="showWizard">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">Create New Goal</h3>
            <UButton
              icon="i-heroicons-x-mark"
              variant="ghost"
              size="sm"
              @click="showWizard = false"
            />
          </div>
        </template>
        <GoalWizard
          :goal="editingGoal"
          @close="closeWizard"
          @created="refreshGoals"
          @updated="refreshGoals"
        />
      </UCard>
    </div>

    <div v-if="loading" class="space-y-4">
      <USkeleton v-for="i in 2" :key="i" class="h-32 w-full" />
    </div>

    <div
      v-else-if="goals.length === 0 && !showWizard"
      class="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg"
    >
      <div
        class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 mb-4"
      >
        <UIcon name="i-heroicons-trophy" class="w-6 h-6 text-gray-400" />
      </div>
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">No goals set</h3>
      <p class="text-gray-500 dark:text-gray-400 mt-1 mb-6">
        Create a goal to get personalized AI coaching advice.
      </p>
      <UButton color="primary" @click="showWizard = true">Create First Goal</UButton>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <GoalCard
        v-for="goal in goals"
        :key="goal.id"
        :goal="goal"
        @edit="handleEdit"
        @delete="deleteGoal"
      />
    </div>

    <!-- Delete Confirmation Modal -->
    <UModal
      v-model:open="showDeleteModal"
      title="Delete Goal?"
      description="Are you sure you want to delete this goal? This action cannot be undone."
      :ui="{ footer: 'justify-end' }"
    >
      <template #footer="{ close }">
        <UButton label="Cancel" variant="outline" color="neutral" @click="close" />
        <UButton label="Delete Goal" color="error" @click="confirmDelete" />
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
  import GoalWizard from '~/components/goals/GoalWizard.vue'
  import GoalCard from '~/components/goals/GoalCard.vue'

  const showWizard = ref(false)
  const editingGoal = ref<any>(null)
  const showDeleteModal = ref(false)
  const goalToDelete = ref<string | null>(null)
  const toast = useToast()

  const { data, pending: loading, refresh } = await useFetch('/api/goals')

  const goals = computed(() => data.value?.goals || [])

  function handleEdit(goal: any) {
    editingGoal.value = goal
    showWizard.value = true
  }

  function closeWizard() {
    showWizard.value = false
    editingGoal.value = null
  }

  async function refreshGoals() {
    await refresh()
  }

  function deleteGoal(id: string) {
    goalToDelete.value = id
    showDeleteModal.value = true
  }

  async function confirmDelete() {
    if (!goalToDelete.value) return

    try {
      await $fetch(`/api/goals/${goalToDelete.value}`, {
        method: 'DELETE'
      })
      refreshGoals()
      toast.add({
        title: 'Goal Deleted',
        color: 'success'
      })
    } catch (error) {
      toast.add({
        title: 'Error',
        description: 'Failed to delete goal',
        color: 'error'
      })
    } finally {
      showDeleteModal.value = false
      goalToDelete.value = null
    }
  }
</script>

<style scoped>
  .animate-fade-in {
    animation: fadeIn 0.2s ease-in-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
