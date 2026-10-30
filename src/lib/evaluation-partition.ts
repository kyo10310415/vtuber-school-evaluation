export const EVALUATION_PARTITION_COUNT = 9
export const EVALUATION_PARTITION_VERSION = 1

type StudentIdentity = {
  studentId?: unknown
  name?: unknown
  enrollmentDate?: unknown
  talkMemoFolderUrl?: unknown
  youtubeChannelId?: unknown
  xAccount?: unknown
}

export function studentPartitionDay(studentId: string): number {
  let hash = 2166136261
  for (let index = 0; index < studentId.length; index++) {
    hash = Math.imul(hash ^ studentId.charCodeAt(index), 16777619) >>> 0
  }
  return hash % EVALUATION_PARTITION_COUNT + 1
}

export function readPartitionRequest(url: string, mode: 'plan' | 'execute', revision?: string) {
  const params = new URL(url).searchParams
  const allowed = new Set(['month', 'partitionDay', 'batchSize', 'batchIndex',
    'skipProLevel', 'skipYouTube', 'skipX', 'skipWanamiUsage', 'skipEvaluated', 'onlyWithTalkMemo'])
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) throw new Error('Invalid partition parameters')
  }
  if (!/^[1-9]$/.test(params.get('partitionDay') || '')) throw new Error('Invalid partition day')
  const month = params.get('month')
  if (month !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid partition month')
  for (const flag of ['skipProLevel', 'skipYouTube', 'skipX', 'skipWanamiUsage', 'skipEvaluated', 'onlyWithTalkMemo']) {
    if (params.has(flag) && !['true', 'false'].includes(params.get(flag)!)) throw new Error('Invalid partition flags')
  }
  if (params.get('skipEvaluated') === 'true' || params.get('onlyWithTalkMemo') === 'true') {
    throw new Error('Partition evaluation requires the complete eligible roster')
  }
  const size = params.get('batchSize') ?? '5'
  if (!/^[1-9]\d*$/.test(size) || !Number.isSafeInteger(Number(size)) || Number(size) > 100) {
    throw new Error('Invalid partition batch size')
  }
  if (mode === 'plan') {
    if (params.has('batchIndex') || revision !== undefined) throw new Error('Invalid plan parameters')
    return { partitionDay: Number(params.get('partitionDay')), batchSize: Number(size), batchIndex: 0 }
  }
  const index = params.get('batchIndex') ?? ''
  if (!/^(0|[1-9]\d*)$/.test(index) || !Number.isSafeInteger(Number(index)) ||
      !Number.isSafeInteger(Number(index) * Number(size)) || !/^[a-f0-9]{64}$/.test(revision || '')) {
    throw new Error('Invalid partition execution parameters')
  }
  return { partitionDay: Number(params.get('partitionDay')), batchSize: Number(size), batchIndex: Number(index) }
}

export async function buildPartitionPlan<T extends StudentIdentity>(
  activeStudents: T[], month: string, partitionDay: number, batchSize: number
) {
  if (!Number.isInteger(partitionDay) || partitionDay < 1 || partitionDay > EVALUATION_PARTITION_COUNT ||
      !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100 ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid partition plan domain')
  const identifiers = new Set<string>()
  const eligible: (T & { studentId: string })[] = []
  let emptyTemplateCount = 0
  let invalidActiveCount = 0
  const hasValue = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== ''
  for (const student of activeStudents) {
    if (typeof student.studentId !== 'string' || !student.studentId.trim()) {
      if (!hasValue(student.studentId) && ![student.name, student.enrollmentDate, student.talkMemoFolderUrl,
        student.youtubeChannelId, student.xAccount].some(hasValue)) emptyTemplateCount++
      else invalidActiveCount++
      continue
    }
    if (identifiers.has(student.studentId)) throw new Error('Duplicate active student identifiers')
    identifiers.add(student.studentId)
    eligible.push(student as T & { studentId: string })
  }
  const students = eligible.filter(student => studentPartitionDay(student.studentId) === partitionDay)
    .sort((left, right) => left.studentId < right.studentId ? -1 : left.studentId > right.studentId ? 1 : 0)
  // Bind the opaque revision to both the exact ordered membership and request domain.
  const domain = JSON.stringify(['partition-v1', month, partitionDay, batchSize, students.map(student => student.studentId)])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(domain))
  const rosterRevision = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
  return {
    students,
    plan: {
      planVersion: EVALUATION_PARTITION_VERSION,
      partitionDay,
      partitionCount: EVALUATION_PARTITION_COUNT,
      activeRows: activeStudents.length,
      eligibleStudents: eligible.length,
      emptyTemplateCount,
      invalidActiveCount,
      partitionStudentCount: students.length,
      batchSize,
      totalBatches: Math.ceil(students.length / batchSize),
      rosterRevision,
    },
  }
}
