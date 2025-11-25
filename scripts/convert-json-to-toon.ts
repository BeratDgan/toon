import type { EncodeOptions } from '../packages/toon/src'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { DEFAULT_DELIMITER, DELIMITERS, encode } from '../packages/toon/src'

const INPUT_DIR = path.resolve(process.cwd(), 'input_json')
const OUTPUT_DIR = path.resolve(process.cwd(), 'output_toon')

interface CliOptions {
  indent: number
  delimiter: EncodeOptions['delimiter']
  keyFolding: NonNullable<EncodeOptions['keyFolding']>
  flattenDepth?: number
  clean: boolean
  verbose: boolean
}

interface ConversionStats {
  processed: number
  converted: number
  skipped: number
  failed: number
}

async function main(): Promise<void> {
  const options = parseCliOptions()
  await ensureWorkspace()

  if (options.clean)
    await emptyOutputDir()

  const stats: ConversionStats = {
    processed: 0,
    converted: 0,
    skipped: 0,
    failed: 0,
  }

  const entries = await readdir(INPUT_DIR, { withFileTypes: true })
  if (!entries.length) {
    console.warn(`No files found in ${relativeFromCwd(INPUT_DIR)}. Add .json files and run again.`)
    return
  }

  for (const entry of entries) {
    const entryPath = path.join(INPUT_DIR, entry.name)
    if (!(await isProcessableFile(entryPath))) {
      stats.skipped += 1
      if (options.verbose)
        console.info(`Skipping ${relativeFromCwd(entryPath)} (not a regular file).`)
      continue
    }

    stats.processed += 1

    if (!entry.name.toLowerCase().endsWith('.json')) {
      stats.skipped += 1
      console.warn(`Skipped ${entry.name}: not a .json file.`)
      continue
    }

    try {
      const rawJson = await readFile(entryPath, 'utf-8')
      const data = JSON.parse(rawJson)
      const toonOutput = encode(data, {
        delimiter: options.delimiter,
        indent: options.indent,
        keyFolding: options.keyFolding,
        flattenDepth: options.flattenDepth,
      })

      const outputName = `${path.parse(entry.name).name}.toon`
      const outputPath = path.join(OUTPUT_DIR, outputName)
      await writeFile(outputPath, toonOutput, 'utf-8')
      stats.converted += 1
      if (options.verbose)
        console.info(`Converted ${relativeFromCwd(entryPath)} → ${relativeFromCwd(outputPath)}`)
    }
    catch (error) {
      stats.failed += 1
      const reason = error instanceof Error ? error.message : String(error)
      console.error(`Failed to convert ${entry.name}. ${reason}`)
    }
  }

  logSummary(stats)
}

function parseCliOptions(): CliOptions {
  const { values } = parseArgs({
    options: {
      indent: { type: 'string' },
      delimiter: { type: 'string' },
      keyFolding: { type: 'string' },
      flattenDepth: { type: 'string' },
      clean: { type: 'boolean', default: false },
      verbose: { type: 'boolean', short: 'v', default: false },
    },
    allowPositionals: false,
  })

  const indent = values.indent ? Number.parseInt(values.indent, 10) : 2
  if (Number.isNaN(indent) || indent < 0)
    throw new Error('`--indent` must be a non-negative integer')

  const allowedDelimiters = Object.values(DELIMITERS) as CliOptions['delimiter'][]
  const delimiter = (values.delimiter ?? DEFAULT_DELIMITER) as CliOptions['delimiter']
  if (!allowedDelimiters.includes(delimiter))
    throw new Error('`--delimiter` must be one of: ",", "\t", "|"')

  const keyFolding = (values.keyFolding ?? 'off') as CliOptions['keyFolding']
  if (keyFolding !== 'off' && keyFolding !== 'safe')
    throw new Error('`--keyFolding` must be "off" or "safe"')

  const flattenDepth = values.flattenDepth !== undefined
    ? Number.parseInt(values.flattenDepth, 10)
    : undefined

  if (flattenDepth !== undefined && (Number.isNaN(flattenDepth) || flattenDepth < 0))
    throw new Error('`--flattenDepth` must be a non-negative integer when provided')

  return {
    indent,
    delimiter,
    keyFolding,
    flattenDepth,
    clean: Boolean(values.clean),
    verbose: Boolean(values.verbose),
  }
}

async function ensureWorkspace(): Promise<void> {
  await mkdir(INPUT_DIR, { recursive: true })
  await mkdir(OUTPUT_DIR, { recursive: true })
}

async function emptyOutputDir(): Promise<void> {
  await rm(OUTPUT_DIR, { recursive: true, force: true })
  await mkdir(OUTPUT_DIR, { recursive: true })
}

async function isProcessableFile(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath)
    return fileStat.isFile()
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`Unable to read ${relativeFromCwd(filePath)}. ${reason}`)
    return false
  }
}

function logSummary(stats: ConversionStats): void {
  console.log('\nBatch conversion summary:')
  console.log(`  Processed: ${stats.processed}`)
  console.log(`  Converted: ${stats.converted}`)
  console.log(`  Skipped:   ${stats.skipped}`)
  console.log(`  Failed:    ${stats.failed}`)

  if (stats.converted === 0)
    console.warn('No files were converted. Ensure there are .json files in input_json.')
}

function relativeFromCwd(target: string): string {
  return path.relative(process.cwd(), target) || '.'
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
