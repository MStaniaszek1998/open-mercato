import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Usage terms for the Open Mercato demo environment.',
}

export default function TermsPage() {
  return (
    <article className="prose prose-slate dark:prose-invert max-w-3xl mx-auto px-6 py-12">
      <h1>Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Last updated: January 1, 2025</p>

      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of this Open Mercato demo environment
        (the &ldquo;Service&rdquo;). By using the Service you agree to be bound by these Terms.
      </p>

      <h2>1. Demo Environment</h2>
      <p>
        This Service is provided for evaluation and demonstration purposes only. All data you create or upload may be
        rotated or deleted at any time without notice. Do not store production, personal, or sensitive information in
        this environment.
      </p>

      <h2>2. Acceptable Use</h2>
      <ul>
        <li>Use the Service only for lawful purposes and in accordance with these Terms.</li>
        <li>Do not attempt to gain unauthorized access to the Service or underlying infrastructure.</li>
        <li>Do not reverse engineer, copy, or reuse content without appropriate attribution.</li>
      </ul>

      <h2>3. No Warranty</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; without any warranties of any kind, whether express or implied.
        Access may be interrupted, limited, or discontinued at any time.
      </p>

      <h2>4. Limitation of Liability</h2>
      <p>
        To the fullest extent permitted by law, Open Mercato and contributors shall not be liable for any damages arising
        from or related to your use of the Service.
      </p>

      <h2>5. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the jurisdiction in which you access the Service, excluding its conflict
        of laws principles.
      </p>

      <h2>6. Changes</h2>
      <p>
        We may update these Terms from time to time. Continued use of the Service after changes become effective
        constitutes acceptance of the revised Terms.
      </p>

      <h2>7. Contact</h2>
      <p>
        Questions about these Terms may be directed to{' '}
        <a className="underline" href="mailto:hello@open-mercato.com">
          hello@open-mercato.com
        </a>
        .
      </p>
    </article>
  )
}
