import type { ZodTypeAny } from 'zod'

export type OpenApiHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type OpenApiSecurityScheme = 'bearerAuth'

export type OpenApiCodeSample = {
  lang: string
  label?: string
  source: string
}

export type OpenApiResponseDoc = {
  status: number
  description?: string
  schema?: ZodTypeAny
  example?: unknown
  mediaType?: string
}

export type OpenApiRequestBodyDoc = {
  contentType?: string
  schema: ZodTypeAny
  example?: unknown
  description?: string
}

export type OpenApiMethodDoc = {
  operationId?: string
  summary?: string
  description?: string
  tags?: string[]
  query?: ZodTypeAny
  headers?: ZodTypeAny
  pathParams?: ZodTypeAny
  requestBody?: OpenApiRequestBodyDoc
  responses?: OpenApiResponseDoc[]
  errors?: OpenApiResponseDoc[]
  deprecated?: boolean
  security?: OpenApiSecurityScheme[]
  codeSamples?: OpenApiCodeSample[]
  externalDocs?: { url: string; description?: string }
  extensions?: Record<string, unknown>
}

export type OpenApiRouteDoc = {
  tag?: string
  summary?: string
  description?: string
  pathParams?: ZodTypeAny
  methods: Partial<Record<OpenApiHttpMethod, OpenApiMethodDoc>>
  extensions?: Record<string, unknown>
}

export type OpenApiDocumentOptions = {
  title?: string
  version?: string
  description?: string
  servers?: Array<{ url: string; description?: string }>
  baseUrlForExamples?: string
  defaultSecurity?: OpenApiSecurityScheme[]
}

export type OpenApiDocument = {
  openapi: '3.1.0'
  info: {
    title: string
    version: string
    description?: string
  }
  servers?: Array<{ url: string; description?: string }>
  tags?: Array<{ name: string; description?: string }>
  paths: Record<string, Record<string, any>>
  components?: {
    schemas?: Record<string, any>
    securitySchemes?: Record<string, any>
  }
}
