import Markdown from 'vite-plugin-md'
// @ts-expect-error
import mila from 'markdown-it-link-attributes'
import { Plugin } from 'vite'
import type { ShikiOptions } from '@slidev/types'
import type MarkdownIt from 'markdown-it'
import base64 from 'js-base64'
import { isTruthy } from '@antfu/utils'
// @ts-expect-error
import Katex from 'markdown-it-katex'
import { ResolvedSlidevOptions, SlidevPluginOptions } from '../options'
import { loadSetups } from './setupNode'
import Prism from './markdown-it-prism'
import Shiki, { resolveShikiOptions } from './markdown-it-shiki'

const DEFAULT_SHIKI_OPTIONS: ShikiOptions = {
  theme: {
    dark: 'min-dark',
    light: 'min-light',
  },
}

export async function createMarkdownPlugin(
  { data: { config }, roots, mode }: ResolvedSlidevOptions,
  { markdown: mdOptions }: SlidevPluginOptions,
): Promise<Plugin> {
  const setups: ((md: MarkdownIt) => void)[] = []

  if (config.highlighter === 'shiki') {
    const { getHighlighter } = await import('shiki')
    const shikiOptions: ShikiOptions = await loadSetups(roots, 'shiki.ts', {}, DEFAULT_SHIKI_OPTIONS, false)
    const { langs, themes } = resolveShikiOptions(shikiOptions)
    shikiOptions.highlighter = await getHighlighter({ themes, langs })
    setups.push(md => md.use(Shiki, shikiOptions))
  }
  else {
    setups.push(md => md.use(Prism))
  }

  return Markdown({
    wrapperClasses: '',
    headEnabled: false,
    markdownItOptions: {
      quotes: '""\'\'',
      html: true,
      xhtmlOut: true,
      linkify: true,
    },
    markdownItSetup(md) {
      md.use(mila, {
        attrs: {
          target: '_blank',
          rel: 'noopener',
        },
      })

      md.use(Katex)

      setups.forEach(i => i(md))
    },
    transforms: {
      before(code) {
        const monaco = (config.monaco === true || config.monaco === mode)
          ? transformMarkdownMonaco
          : truncateMancoMark

        code = monaco(code)
        code = transformHighlighter(code)

        return code
      },
    },
    ...mdOptions,
  })
}

export function transformMarkdownMonaco(md: string) {
  const typeModules = new Set<string>()

  // transform monaco
  md = md.replace(/\n```(\w+?)\s*{monaco([\w:,-]*)}[\s\n]*([\s\S]+?)\n```/mg, (full, lang = 'ts', options: string, code: string) => {
    options = options || ''
    lang = lang.trim()
    if (lang === 'ts' || lang === 'typescript') {
      Array.from(code.matchAll(/\s+from\s+(["'])([\/\w@-]+)\1/g))
        .map(i => i[2])
        .filter(isTruthy)
        .map(i => typeModules.add(i))
    }
    const encoded = base64.encode(code, true)
    return `<Monaco :code="'${encoded}'" lang="${lang}" :readonly="${options.includes('readonly')}" />`
  })

  // types auto discovery for TypeScript monaco
  if (typeModules.size)
    md += `\n<script setup>\n${Array.from(typeModules).map(i => `import('/@slidev-monaco-types/${i}')`).join('\n')}\n</script>\n`

  return md
}

export function truncateMancoMark(code: string) {
  return code.replace(/{monaco.*?}/g, '')
}

export function transformHighlighter(md: string) {
  // transform monaco
  return md.replace(/\n```(\w+?)\s*{([\d\w*,\|-]+)}[\s\n]*([\s\S]+?)\n```/mg, (full, lang = '', rangeStr: string, code: string) => {
    const ranges = rangeStr.split(/\|/g).map(i => i.trim())
    return `\n<CodeHighlightController :ranges='${JSON.stringify(ranges)}'>\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n</CodeHighlightController>`
  })
}
