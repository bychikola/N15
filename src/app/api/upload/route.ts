import { getPayload } from 'payload'
import config from '@payload-config'
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const alt = (formData.get('alt') as string) || 'Uploaded image'

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Save file to filesystem
    const uploadsDir = path.join(process.cwd(), 'media')
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true })
    }

    const filename = `${Date.now()}-${file.name}`
    const filepath = path.join(uploadsDir, filename)
    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(filepath, buffer)

    // Create media entry via Payload
    const payload = await getPayload({ config })

    const media = await payload.create({
      collection: 'media',
      data: {
        alt,
      },
      file: {
        data: buffer,
        mimetype: file.type,
        name: filename,
        size: buffer.length,
      },
    })

    return NextResponse.json({ doc: media })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
