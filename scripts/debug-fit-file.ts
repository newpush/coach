import fs from 'fs'
import path from 'path'
// @ts-expect-error - fit-file-parser types are missing or incompatible
import FitParser from 'fit-file-parser'

const filename = process.argv[2]

if (!filename) {
  console.error('Please provide a filename')
  process.exit(1)
}

const filePath = path.resolve(filename)

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`)
  process.exit(1)
}

const content = fs.readFileSync(filePath)

const fitParser = new FitParser({
  force: true,
  speedUnit: 'km/h',
  lengthUnit: 'km',
  temperatureUnit: 'celsius',
  elapsedRecordField: true,
  mode: 'list'
})

fitParser.parse(content, (error: any, data: any) => {
  if (error) {
    console.error('Error parsing file:', error)
  } else {
    console.log(JSON.stringify(data, null, 2))
  }
})
