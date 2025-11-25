import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import process from 'node:process'
import { encode } from '../packages/toon/src'

const INPUT_DIR = path.join(process.cwd(), 'input_json')
const OUTPUT_DIR = path.join(process.cwd(), 'output_toon')

interface ConversionResult {
  success: boolean
  inputFile: string
  outputFile?: string
  error?: string
}

async function convertJsonToToon(inputPath: string, outputPath: string): Promise<void> {
  const jsonContent = await fsp.readFile(inputPath, 'utf-8')

  let data: unknown
  try {
    data = JSON.parse(jsonContent)
  }
  catch (error) {
    throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  const toonOutput = encode(data, {
    indent: 2,
    keyFolding: 'off',
  })

  await fsp.writeFile(outputPath, toonOutput, 'utf-8')
}

async function getJsonFiles(dir: string): Promise<string[]> {
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  const jsonFiles: string[] = []

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      jsonFiles.push(path.join(dir, entry.name))
    }
  }

  return jsonFiles
}

async function main(): Promise<void> {
  console.log('🚀 Starting batch JSON to TOON conversion...\n')

  // Ensure directories exist
  if (!fs.existsSync(INPUT_DIR)) {
    console.error(`❌ Input directory does not exist: ${INPUT_DIR}`)
    console.log('   Please create the input_json directory and add JSON files.')
    process.exit(1)
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    await fsp.mkdir(OUTPUT_DIR, { recursive: true })
    console.log(`📁 Created output directory: ${OUTPUT_DIR}`)
  }

  // Get all JSON files
  const jsonFiles = await getJsonFiles(INPUT_DIR)

  if (jsonFiles.length === 0) {
    console.log('📭 No JSON files found in input_json directory.')
    console.log('   Add .json files to the input_json directory and run again.')
    return
  }

  console.log(`📂 Found ${jsonFiles.length} JSON file(s) to convert:\n`)

  const results: ConversionResult[] = []

  for (const inputFile of jsonFiles) {
    const baseName = path.basename(inputFile, '.json')
    const outputFile = path.join(OUTPUT_DIR, `${baseName}.toon`)
    const relativeInput = path.relative(process.cwd(), inputFile)
    const relativeOutput = path.relative(process.cwd(), outputFile)

    try {
      await convertJsonToToon(inputFile, outputFile)
      results.push({ success: true, inputFile: relativeInput, outputFile: relativeOutput })
      console.log(`   ✅ ${relativeInput} → ${relativeOutput}`)
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      results.push({ success: false, inputFile: relativeInput, error: errorMessage })
      console.error(`   ❌ ${relativeInput}: ${errorMessage}`)
    }
  }

  // Summary
  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length

  console.log('\n📊 Conversion Summary:')
  console.log(`   ✅ Successful: ${successCount}`)
  if (failCount > 0) {
    console.log(`   ❌ Failed: ${failCount}`)
  }
  console.log(`\n🎉 Batch conversion complete!`)

  if (failCount > 0) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
