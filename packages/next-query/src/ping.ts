'use server'

export async function ping(): Promise<string> {
  return `pong ${process.env.NODE_ENV}`
}
