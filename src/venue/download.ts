/** Local time as YYYYMMDD-HHmmss, so exports sort by when they were made */
export function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  )
}

/** Hand the browser a JSON file to save */
export function downloadJSON(fileName: string, json: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  a.download = fileName
  a.click()
  URL.revokeObjectURL(a.href)
}
