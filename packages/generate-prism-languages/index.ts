import flowRight from "lodash.flowright"
import pc from "picocolors"
import { readFile, writeFile, access } from "node:fs/promises"
import { constants } from "node:fs"
import { join, dirname } from "node:path"
import { languages as prismLanguages } from "prismjs/components"
import uglify from "uglify-js"

export const languagesToBundle = <const>[
  "jsx",
  "tsx",
  "swift",
  "kotlin",
  "objectivec",
  "rust",
  "graphql",
  "yaml",
  "go",
  "cpp",
  "markdown",
]

/**
 * We need to disable typechecking on this generated file as it's just concatenating JS code
 * that starts off assuming Prism lives in global scope. We also need to provide Prism as that
 * gets passed into an iffe preventing us from needing to use global scope.
 */
const header = `// eslint-disable-next-line @typescript-eslint/ban-ts-comment\n// @ts-nocheck\nimport Prism from "prismjs"\n`
const prismPath = dirname(require.resolve("prismjs"))

const readLanguageFile = async (language: string): Promise<string> => {
  const pathToLanguage = join(prismPath, `components/prism-${language}.js`)
  try {
    await access(pathToLanguage, constants.R_OK)
    const buffer = await readFile(pathToLanguage, { encoding: "utf-8" })
    return buffer.toString()
  } catch (e) {
    return ""
  }
}

const strArrayFromUnknown = (input: unknown) => (array: string[]) => {
  if (typeof input === "string") array.push(input)
  else if (Array.isArray(input)) {
    array = [...array, ...input.filter(i => typeof i === "string")]
  }
  return array
}

const main = async () => {
  let output = ""
  const bundledLanguages = new Set<keyof typeof prismLanguages>()
  const orderBundled = new Set<keyof typeof prismLanguages>()
  const outputPath = join(
    __dirname,
    "../prism-react-renderer/src/prism-langs.ts"
  )

  const addLanguageToOutput = async (language: string) => {
    if (bundledLanguages.has(language)) {
      return
    }
    if (prismLanguages[language] == null) {
      return
    }
    bundledLanguages.add(language)

    /**
     * We need to ensure any language dependencies are bundled first
     */
    const prismLang = prismLanguages[language]
    const deps = flowRight(
      strArrayFromUnknown(prismLang.require),
      strArrayFromUnknown(prismLang.optional)
    )([])
    const peerDeps = strArrayFromUnknown(prismLang.peerDependencies)([])

    for await (const language of deps) {
      await addLanguageToOutput(language)
    }

    output += await readLanguageFile(language)
    orderBundled.add(language)

    for await (const language of peerDeps) {
      await addLanguageToOutput(language)
    }
  }

  for await (const language of languagesToBundle) {
    await addLanguageToOutput(language)
  }

  console.info(
    pc.bold(pc.bgYellow(pc.black("Formidable Prism React Renderer"))),
    "\n"
  )
  console.info(
    pc.bgBlue(`Generated TypeScript output at:`),
    pc.cyan(outputPath)
  )
  console.info(
    pc.bgGreen(`Included language definitions in the following order:`),
    Array.from(orderBundled.values()).join(", ")
  )

  await writeFile(outputPath, header + uglify.minify(output).code)
}

main()
