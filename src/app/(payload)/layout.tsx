import config from '@payload-config'
import '@payloadcms/next/css'
import { metadata as payloadMetadata, RootLayout } from '@payloadcms/next/layouts'
import React from 'react'

import { importMap } from './admin/importMap.js'
import { serverFn } from './admin/server-actions'
import './custom.css'

export { payloadMetadata as metadata }

type Args = {
  children: React.ReactNode
}

const Layout = ({ children }: Args) => (
  <RootLayout config={config} importMap={importMap} serverFunction={serverFn}>
    {children}
  </RootLayout>
)

export default Layout
