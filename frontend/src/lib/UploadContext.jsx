import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import API from './api.js'

const UploadContext = createContext(null)

export function UploadProvider({ children }) {
  const [queue, setQueue] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  
  // Use a ref to keep track of processing state
  const processingRef = useRef(false)
  
  // Use a ref for the queue so the async runner always sees the latest state
  // without needing to be recreated on every state change
  const queueRef = useRef(queue)
  useEffect(() => { queueRef.current = queue }, [queue])

  const addTasks = useCallback((tasks) => {
    console.log('[UploadContext] Adding tasks:', tasks.length, tasks)
    const newTasks = tasks.map(t => ({
      ...t,
      status: 'pending',
      attempts: 0,
      addedAt: Date.now(),
      lastAttempt: null,
      error: null
    }))
    setQueue(prev => {
        console.log('[UploadContext] Queue updated. Old size:', prev.length, 'New size:', prev.length + newTasks.length)
        return [...prev, ...newTasks]
    })
  }, [])

  const retryTask = useCallback((taskId) => {
    console.log('[UploadContext] Retrying task:', taskId)
    setQueue(prev => prev.map(t => t.id === taskId ? { ...t, status: 'pending', attempts: 0, error: null } : t))
  }, [])

  const removeTask = useCallback((taskId) => {
    console.log('[UploadContext] Removing task:', taskId)
    setQueue(prev => prev.filter(t => t.id !== taskId))
  }, [])

  // Process queue
  useEffect(() => {
    let mounted = true
    const runNext = async () => {
      if (processingRef.current) return

      const now = Date.now()
      // Use queueRef to get the latest queue without triggering re-runs of this effect
      const currentQueue = queueRef.current
      const candidate = currentQueue.find(t => 
        t.status === 'pending' || 
        (t.status === 'failed' && t.attempts < 3 && (now - (t.lastAttempt || 0) > 5000))
      )

      if (!candidate) return

      console.log('[UploadContext] Starting task:', candidate.id, candidate.label)
      processingRef.current = true
      setIsProcessing(true)
      
      setQueue(prev => prev.map(t => t.id === candidate.id ? { ...t, status: 'uploading' } : t))

      try {
        console.log('[UploadContext] Executing run() for:', candidate.id)
        await candidate.run()
        console.log('[UploadContext] Task completed successfully:', candidate.id)
        
        if (!mounted) return
        setQueue(prev => prev.map(t => t.id === candidate.id ? { ...t, status: 'completed' } : t))
      } catch (err) {
        console.error('[UploadContext] Task failed:', candidate.id, err)
        if (!mounted) return
        setQueue(prev => prev.map(t => t.id === candidate.id ? { 
          ...t, 
          status: 'failed', 
          attempts: (t.attempts || 0) + 1,
          lastAttempt: Date.now(),
          error: err.message || 'Unknown error'
        } : t))
      } finally {
        if (mounted) {
          processingRef.current = false
          setIsProcessing(false)
        }
      }
    }

    const interval = setInterval(() => {
      if (!processingRef.current) runNext()
    }, 1000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, []) // Empty dependency to prevent effect cleanup on queue updates

  const value = {
    queue,
    addTasks,
    retryTask,
    removeTask,
    isProcessing
  }

  return (
    <UploadContext.Provider value={value}>
      {children}
    </UploadContext.Provider>
  )
}

export function useUpload() {
  const ctx = useContext(UploadContext)
  if (!ctx) throw new Error('useUpload must be used within UploadProvider')
  return ctx
}
