'use server'

import config from '@payload-config'
import { handleServerFunctions } from '@payloadcms/next/layouts'
import type { ServerFunctionClient } from 'payload'

import { importMap } from './importMap.js'

export const serverFn: ServerFunctionClient = async function (args) {
  return handleServerFunctions({
    ...args,
    config,
    importMap,
  })
}
