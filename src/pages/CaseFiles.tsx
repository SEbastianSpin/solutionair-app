import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  CircularProgress,
  Alert,
} from '@mui/material'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import DownloadIcon from '@mui/icons-material/Download'
import { listCaseFiles, getFileDownloadUrl } from '../services/storageService'
import type { CaseFile } from '../services/storageService'

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export default function CaseFiles() {
  const { shortId } = useParams<{ shortId: string }>()
  const [files, setFiles] = useState<CaseFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => {
    if (!shortId) return

    async function fetchFiles() {
      try {
        setLoading(true)
        setError(null)
        const caseFiles = await listCaseFiles(shortId)
        setFiles(caseFiles)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load files')
      } finally {
        setLoading(false)
      }
    }

    fetchFiles()
  }, [shortId])

  const handleDownload = async (fileName: string) => {
    if (!shortId) return

    try {
      setDownloading(fileName)
      const url = await getFileDownloadUrl(shortId, fileName)
      window.open(url, '_blank')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download file')
    } finally {
      setDownloading(null)
    }
  }

  if (!shortId) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Invalid case ID</Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom>
        Case Files: {shortId}
      </Typography>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && files.length === 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography color="text.secondary">
            No files found for this case.
          </Typography>
        </Paper>
      )}

      {!loading && files.length > 0 && (
        <Paper>
          <List>
            {files.map((file) => (
              <ListItem
                key={file.name}
                secondaryAction={
                  <IconButton
                    edge="end"
                    onClick={() => handleDownload(file.name)}
                    disabled={downloading === file.name}
                  >
                    {downloading === file.name ? (
                      <CircularProgress size={24} />
                    ) : (
                      <DownloadIcon />
                    )}
                  </IconButton>
                }
              >
                <ListItemIcon>
                  <InsertDriveFileIcon />
                </ListItemIcon>
                <ListItemText
                  primary={file.name}
                  secondary={formatFileSize(file.size)}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  )
}
