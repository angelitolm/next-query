'use client'
import { useState } from 'react'
import { ping } from './ping.js'

export function PingButton() {
  const [result, setResult] = useState('not pinged')
  return (
    <button id="ping" onClick={async () => setResult(await ping())}>
      {result}
    </button>
  )
}
