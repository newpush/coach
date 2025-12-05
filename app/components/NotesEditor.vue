<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold text-gray-900 dark:text-white">Personal Notes</h2>
      <UButton
        v-if="!isEditing"
        icon="i-heroicons-pencil"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="startEditing"
      >
        {{ hasNotes ? 'Edit' : 'Add Notes' }}
      </UButton>
      <div v-else class="flex gap-2">
        <UButton
          icon="i-heroicons-check"
          color="primary"
          size="sm"
          :loading="saving"
          :disabled="saving"
          @click="saveNotes"
        >
          Save
        </UButton>
        <UButton
          icon="i-heroicons-x-mark"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="saving"
          @click="cancelEditing"
        >
          Cancel
        </UButton>
      </div>
    </div>

    <!-- Empty State (not editing, no notes) -->
    <div v-if="!isEditing && !hasNotes" class="text-center py-8">
      <div class="text-gray-500 dark:text-gray-400">
        <span class="i-heroicons-document-text w-12 h-12 mx-auto mb-4 opacity-50"></span>
        <p class="text-sm">No notes yet. Click "Add Notes" to add your personal notes and observations.</p>
      </div>
    </div>

    <!-- Display Notes (not editing, has notes) - Rendered HTML -->
    <div v-if="!isEditing && hasNotes" class="space-y-3">
      <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-4">
        <div class="prose prose-sm dark:prose-invert max-w-none" v-html="renderedNotes"></div>
      </div>
      <div v-if="notesUpdatedAt" class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span class="i-heroicons-clock w-3 h-3"></span>
        <span>Last updated: {{ formatDate(notesUpdatedAt) }}</span>
      </div>
    </div>

    <!-- Editor (is editing) -->
    <div v-if="isEditing" class="space-y-3">
      <div class="rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden bg-white dark:bg-gray-900">
        <!-- Custom Toolbar -->
        <div v-if="editor" class="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 px-2 py-2 flex flex-wrap gap-1">
            <!-- Bold -->
            <UButton
              icon="i-lucide-bold"
              size="xs"
              color="neutral"
              variant="ghost"
              :class="{ 'bg-gray-200 dark:bg-gray-700': editor.isActive('bold') }"
              @click="editor.chain().focus().toggleBold().run()"
            />
            <!-- Italic -->
            <UButton
              icon="i-lucide-italic"
              size="xs"
              color="neutral"
              variant="ghost"
              :class="{ 'bg-gray-200 dark:bg-gray-700': editor.isActive('italic') }"
              @click="editor.chain().focus().toggleItalic().run()"
            />
            <!-- Strike -->
            <UButton
              icon="i-lucide-strikethrough"
              size="xs"
              color="neutral"
              variant="ghost"
              :class="{ 'bg-gray-200 dark:bg-gray-700': editor.isActive('strike') }"
              @click="editor.chain().focus().toggleStrike().run()"
            />
            
            <div class="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"></div>
            
            <!-- Heading 1 -->
            <UButton
              icon="i-lucide-heading-1"
              size="xs"
              color="neutral"
              variant="ghost"
              :class="{ 'bg-gray-200 dark:bg-gray-700': editor.isActive('heading', { level: 1 }) }"
              @click="editor.chain().focus().toggleHeading({ level: 1 }).run()"
            />
            <!-- Heading 2 -->
            <UButton
              icon="i-lucide-heading-2"
              size="xs"
              color="neutral"
              variant="ghost"
              :class="{ 'bg-gray-200 dark:bg-gray-700': editor.isActive('heading', { level: 2 }) }"
              @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
            />
            <!-- Heading 3 -->
            <UButton
              icon="i-lucide-heading-3"
              size="xs"
              color="neutral"
              variant="ghost"
              :class="{ 'bg-gray-200 dark:bg-gray-700': editor.isActive('heading', { level: 3 }) }"
              @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
            />
            
            <div class="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"></div>
            
            <!-- Bullet List -->
            <UButton
              icon="i-lucide-list"
              size="xs"
              color="neutral"
              variant="ghost"
              :class="{ 'bg-gray-200 dark:bg-gray-700': editor.isActive('bulletList') }"
              @click="editor.chain().focus().toggleBulletList().run()"
            />
            <!-- Ordered List -->
            <UButton
              icon="i-lucide-list-ordered"
              size="xs"
              color="neutral"
              variant="ghost"
              :class="{ 'bg-gray-200 dark:bg-gray-700': editor.isActive('orderedList') }"
              @click="editor.chain().focus().toggleOrderedList().run()"
            />
            
            <div class="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"></div>
            
            <!-- Blockquote -->
            <UButton
              icon="i-lucide-quote"
              size="xs"
              color="neutral"
              variant="ghost"
              :class="{ 'bg-gray-200 dark:bg-gray-700': editor.isActive('blockquote') }"
              @click="editor.chain().focus().toggleBlockquote().run()"
            />
            <!-- Code Block -->
            <UButton
              icon="i-lucide-code"
              size="xs"
              color="neutral"
              variant="ghost"
              :class="{ 'bg-gray-200 dark:bg-gray-700': editor.isActive('codeBlock') }"
              @click="editor.chain().focus().toggleCodeBlock().run()"
            />
            
            <div class="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"></div>
            
            <!-- Horizontal Rule -->
            <UButton
              icon="i-lucide-minus"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="editor.chain().focus().setHorizontalRule().run()"
            />
            
            <div class="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1"></div>
            
            <!-- Undo -->
            <UButton
              icon="i-lucide-undo"
              size="xs"
              color="neutral"
              variant="ghost"
              :disabled="!editor.can().undo()"
              @click="editor.chain().focus().undo().run()"
            />
            <!-- Redo -->
            <UButton
              icon="i-lucide-redo"
              size="xs"
              color="neutral"
              variant="ghost"
              :disabled="!editor.can().redo()"
              @click="editor.chain().focus().redo().run()"
            />
          </div>
        
        <!-- Editor Content -->
        <EditorContent :editor="editor" class="px-4 py-3" />
      </div>
      <div class="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span class="i-heroicons-information-circle w-4 h-4 mt-0.5 flex-shrink-0"></span>
        <div class="space-y-1">
          <p>Use the toolbar above for formatting, or keyboard shortcuts:</p>
          <ul class="list-disc list-inside space-y-0.5 ml-2">
            <li><span class="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">Cmd/Ctrl+B</span> for bold</li>
            <li><span class="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">Cmd/Ctrl+I</span> for italic</li>
            <li><span class="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">Cmd/Ctrl+K</span> for link</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TurndownService from 'turndown'
import { marked } from 'marked'

const props = defineProps<{
  modelValue: string | null
  notesUpdatedAt?: string | Date | null
  apiEndpoint: string
}>()

// Initialize Turndown for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
})

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
  'update:notesUpdatedAt': [value: Date | null]
}>()

const toast = useToast()

const isEditing = ref(false)
const saving = ref(false)

const hasNotes = computed(() => {
  return props.modelValue && props.modelValue.trim().length > 0
})

// Convert markdown to HTML for display
const renderedNotes = computed(() => {
  if (!props.modelValue) return ''
  return marked.parse(props.modelValue) as string
})

const editor = useEditor({
  extensions: [
    StarterKit,
    Placeholder.configure({
      placeholder: 'Add your personal notes, observations, or insights here...'
    })
  ],
  content: '',
  editable: true,
  editorProps: {
    attributes: {
      class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[300px]'
    }
  }
})

function startEditing() {
  isEditing.value = true
  nextTick(() => {
    if (editor.value) {
      // Convert markdown to HTML for editing
      const htmlContent = props.modelValue ? marked.parse(props.modelValue) as string : ''
      editor.value.commands.setContent(htmlContent)
      editor.value.commands.focus()
    }
  })
}

function cancelEditing() {
  isEditing.value = false
  if (editor.value) {
    editor.value.commands.setContent('')
  }
}

async function saveNotes() {
  if (!editor.value) return
  
  saving.value = true
  try {
    // Convert HTML to Markdown before saving
    let content: string | null = null
    if (editor.value.getText().trim()) {
      const html = editor.value.getHTML()
      content = turndownService.turndown(html)
    }
    
    const response = await $fetch(props.apiEndpoint, {
      method: 'PATCH',
      body: {
        notes: content
      }
    }) as any

    if (response?.success) {
      emit('update:modelValue', content)
      
      if (response.workout?.notesUpdatedAt) {
        emit('update:notesUpdatedAt', response.workout.notesUpdatedAt)
      } else if (response.nutrition?.notesUpdatedAt) {
        emit('update:notesUpdatedAt', response.nutrition.notesUpdatedAt)
      }
      
      isEditing.value = false
      
      toast.add({
        title: 'Notes Saved',
        description: 'Your notes have been saved successfully',
        color: 'success',
        icon: 'i-heroicons-check-circle'
      })
    }
  } catch (e: any) {
    console.error('Error saving notes:', e)
    toast.add({
      title: 'Save Failed',
      description: e.data?.message || e.message || 'Failed to save notes',
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    })
  } finally {
    saving.value = false
  }
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onBeforeUnmount(() => {
  if (editor.value) {
    editor.value.destroy()
  }
})
</script>

<style scoped>
:deep(.ProseMirror) {
  outline: none;
}

:deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: rgb(156 163 175);
  pointer-events: none;
  height: 0;
}
</style>