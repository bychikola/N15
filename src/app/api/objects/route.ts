import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const payload = await getPayload({ config })

    const object = await payload.create({
      collection: 'objects',
      data: body,
    })

    return NextResponse.json({ doc: object })
  } catch (error) {
    console.error('Create object error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
