import { describe, it, expect, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useScrollLock } from './useScrollLock'

const LockComponent = defineComponent({
  setup() {
    useScrollLock()
    return () => h('div')
  },
})

afterEach(() => {
  document.body.style.removeProperty('overflow')
})

describe('useScrollLock', () => {
  it('locks body overflow on mount', () => {
    mount(LockComponent)
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('restores overflow on unmount', () => {
    const wrapper = mount(LockComponent)
    expect(document.body.style.overflow).toBe('hidden')
    wrapper.unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('restores a previous inline overflow value', () => {
    document.body.style.overflow = 'auto'
    const wrapper = mount(LockComponent)
    expect(document.body.style.overflow).toBe('hidden')
    wrapper.unmount()
    expect(document.body.style.overflow).toBe('auto')
  })
})