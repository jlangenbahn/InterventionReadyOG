function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function uniquePhrases(values) {
  const seen = new Set()
  const phrases = []
  for (const value of values ?? []) {
    const phrase = String(value ?? '').trim()
    if (!phrase) continue
    const key = phrase.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    phrases.push(phrase)
  }
  return phrases
}

function stripLeadingPhrase(text, phrase) {
  const trimmedPhrase = String(phrase ?? '').trim()
  if (!trimmedPhrase) return String(text ?? '')
  const re = new RegExp(
    `^${escapeRegExp(trimmedPhrase)}(?=\\s|$|[:.\\-–—])\\s*[:.\\-–—]?\\s*`,
    'i',
  )
  return String(text ?? '').replace(re, '')
}

function unwrapQuotes(text) {
  const out = String(text ?? '').trim()
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'")) ||
    (out.startsWith('“') && out.endsWith('”'))
  ) {
    return out.slice(1, -1).trim()
  }
  return out
}

function isStandaloneHeading(line, knownTitles) {
  const first = String(line ?? '')
    .replace(/^#{1,6}\s+/, '')
    .trim()
  if (!first) return true
  return knownTitles.some((title) => title.toLowerCase() === first.toLowerCase())
}

/**
 * Strip markdown titles and duplicated headings the model sometimes prefixes
 * onto generated sentences and passages.
 */
export function sanitizeGeneratedLessonText(text, { conceptName = '', title = '' } = {}) {
  let out = unwrapQuotes(String(text ?? '').replace(/\r\n/g, '\n'))
  if (!out) return { text: '', extractedTitle: '' }

  const knownTitles = uniquePhrases([title, conceptName])
  let extractedTitle = ''
  let sawHeading = false

  const hashes = out.match(/^(#{1,6})\s+/)
  if (hashes) {
    sawHeading = true
    out = out.slice(hashes[0].length)
    const newlineAt = out.indexOf('\n')
    if (newlineAt === -1) {
      const known = knownTitles.find((phrase) =>
        out.toLowerCase().startsWith(phrase.toLowerCase()),
      )
      if (known) {
        extractedTitle = known
        out = out.slice(known.length).replace(/^\s*[:.\\-–—]?\s*/, '')
      } else {
        const headingWords = out.match(/^((?:[A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,7}))\s+/)
        if (headingWords) {
          extractedTitle = headingWords[1]
          out = out.slice(headingWords[0].length)
        }
      }
    } else {
      extractedTitle = out.slice(0, newlineAt).trim()
      out = out.slice(newlineAt + 1).trim()
    }
  }

  const lines = out.split('\n')
  while (lines.length > 1 && isStandaloneHeading(lines[0], knownTitles)) {
    const first = lines[0].replace(/^#{1,6}\s+/, '').trim()
    if (first) extractedTitle = extractedTitle || first
    lines.shift()
  }
  out = lines.join('\n').trim()

  const titlesToStrip = uniquePhrases([extractedTitle, ...knownTitles])
  if (sawHeading || extractedTitle) {
    for (const phrase of titlesToStrip) {
      out = stripLeadingPhrase(out, phrase)
      out = stripLeadingPhrase(out, phrase)
    }
  }

  return { text: out.trim(), extractedTitle }
}

export function sanitizeLessonBody(text, extras = {}) {
  return sanitizeGeneratedLessonText(text, extras).text
}
