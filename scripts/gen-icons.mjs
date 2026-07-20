import sharp from 'sharp'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const dir = resolve('public/icons')

async function gen(name, size, svgFile = 'source.svg') {
  const src = readFileSync(resolve(`public/icons/${svgFile}`))
  await sharp(src).resize(size, size).png().toFile(`${dir}/${name}.png`)
  console.log(`created ${name}.png (${size}x${size})`)
}

async function main() {
  await gen('icon-192', 192)
  await gen('icon-512', 512)
  await gen('maskable-512', 512, 'source-maskable.svg')
  await gen('apple-touch-icon-180', 180)
}

main().catch(console.error)
