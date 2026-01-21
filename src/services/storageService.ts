import { supabase } from '../lib/supabase'

const BUCKET_NAME = 'cases'

export interface CaseFile {
  name: string
  size: number
  createdAt: string
}

export async function listCaseFiles(shortId: string): Promise<CaseFile[]> {
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .list(shortId, {
      sortBy: { column: 'created_at', order: 'desc' },
    })

  if (error) {
    throw new Error(`Failed to list files: ${error.message}`)
  }

  return (data || [])
    .filter((item) => item.name !== '.emptyFolderPlaceholder')
    .map((item) => ({
      name: item.name,
      size: item.metadata?.size || 0,
      createdAt: item.created_at || '',
    }))
}

export async function getFileDownloadUrl(
  shortId: string,
  fileName: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(`${shortId}/${fileName}`, 3600)

  if (error) {
    throw new Error(`Failed to get download URL: ${error.message}`)
  }

  return data.signedUrl
}
