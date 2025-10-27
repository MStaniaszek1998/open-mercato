import React from 'react'
import { Html, Head, Preview, Body, Container, Heading, Text, Section, Button, Hr } from '@react-email/components'

export type VerificationEmailCopy = {
  preview: string
  heading: string
  greeting: string
  body: string
  cta: string
  expiry: string
  footer: string
}

type VerificationEmailProps = {
  verifyUrl: string
  copy: VerificationEmailCopy
}

export default function VerificationEmail({ verifyUrl, copy }: VerificationEmailProps) {
  return (
    <Html>
      <Head>
        <title>{copy.heading}</title>
      </Head>
      <Preview>{copy.preview}</Preview>
      <Body style={{ backgroundColor: '#f1f5f9', fontFamily: 'Helvetica, Arial, sans-serif', padding: '24px 0' }}>
        <Container style={{ backgroundColor: '#ffffff', padding: '32px', borderRadius: '12px', margin: '0 auto', maxWidth: '520px' }}>
          <Heading style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 16px' }}>{copy.heading}</Heading>
          <Text style={{ fontSize: '16px', color: '#334155', marginBottom: '16px' }}>{copy.greeting}</Text>
          <Text style={{ fontSize: '16px', color: '#334155', marginBottom: '16px', lineHeight: '24px' }}>{copy.body}</Text>
          <Section style={{ textAlign: 'center', margin: '32px 0' }}>
            <Button
              href={verifyUrl}
              style={{
                backgroundColor: '#111827',
                color: '#ffffff',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '15px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              {copy.cta}
            </Button>
          </Section>
          <Text style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px', lineHeight: '22px' }}>{copy.expiry}</Text>
          <Hr style={{ borderColor: '#e2e8f0', margin: '24px 0' }} />
          <Text style={{ fontSize: '12px', color: '#94a3b8' }}>{copy.footer}</Text>
        </Container>
      </Body>
    </Html>
  )
}
