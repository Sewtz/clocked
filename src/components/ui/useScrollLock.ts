import { onMounted, onBeforeUnmount } from 'vue'

export function useScrollLock(): void {
  let prev: string | null = null

  onMounted(() => {
    if (typeof document === 'undefined') return
    prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  })

  onBeforeUnmount(() => {
    if (typeof document === 'undefined') return
    if (prev === null) {
      document.body.style.removeProperty('overflow')
    } else {
      document.body.style.overflow = prev
    }
  })
}