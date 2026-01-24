import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import NotesIcon from '@mui/icons-material/Notes'
import EuroIcon from '@mui/icons-material/Euro'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import HistoryIcon from '@mui/icons-material/History'
import CloseIcon from '@mui/icons-material/Close'
import TimerIcon from '@mui/icons-material/Timer'
import { AgGridReact } from 'ag-grid-react'
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community'
import type { ColDef, ValueFormatterParams } from 'ag-grid-community'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { supabase } from '../lib/supabase'

dayjs.extend(utc)
ModuleRegistry.registerModules([AllCommunityModule])

interface Case {
  case_id: number
  short_id: string
  flight_number: string | null
  d_scheduled_time_utc: string | null
  campaign_id: number | null
  source_channel: string
  source_details: Record<string, unknown> | null
  customer_email: string
  customer_name: string
  customer_phone: string | null
  compensation_amount_eur: number | null
  other_amount_eur: number | null
  other_amount_notes: string | null
  created_at: string | null
  updated_at: string | null
  internal_notes: string | null
  case_status: string
  case_type: string
  lang_code: string
  bank_details: Record<string, unknown> | null
}

interface AuditLog {
  audit_id: number
  case_id: number
  column_name: string
  old_value: string | null
  new_value: string | null
  changed_at: string
  changed_by: string | null
}

export default function Cases() {
  const [casesData, setCasesData] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)
  const [auditModalOpen, setAuditModalOpen] = useState(false)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [statusChangeDates, setStatusChangeDates] = useState<Map<number, string>>(new Map())
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [statusModalCase, setStatusModalCase] = useState<Case | null>(null)
  const [newStatus, setNewStatus] = useState('')
  const [statusNotes, setStatusNotes] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })
  const [notesModalOpen, setNotesModalOpen] = useState(false)
  const [notesModalCase, setNotesModalCase] = useState<Case | null>(null)
  const [amountsModalOpen, setAmountsModalOpen] = useState(false)
  const [amountsModalCase, setAmountsModalCase] = useState<Case | null>(null)
  const [editCompensation, setEditCompensation] = useState('')
  const [editOtherAmount, setEditOtherAmount] = useState('')
  const [editOtherNotes, setEditOtherNotes] = useState('')
  const [amountsSaving, setAmountsSaving] = useState(false)

  const CASE_STATUSES = [
    'NEW',
    'NEW_WITH_AGREEMENT',
    'ELIGIBLE',
    'NOT_ELIGIBLE',
    'AGREEMENT_SENT',
    'AGREEMENT_SIGNED',
    'SUBMITTED_TO_AIRLINE',
    'AIRLINE_ACCEPTED',
    'AIRLINE_REJECTED',
    'AIRLINE_NO_RESPONSE',
    'ESCALATED_LEGAL',
    'COURT_WON',
    'COURT_LOST',
    'RENOUNCED',
    'PAYMENT_RECEIVED',
    'WAITING_BANK_DETAILS',
    'READY_TO_PAY',
    'WAITING_CUSTOMER_INFO',
    'PAID_TO_CUSTOMER',
    'WITHDRAWN',
    'DUPLICATE',
    'CLOSED',
  ]

  const openStatusModal = useCallback((caseData: Case) => {
    setStatusModalCase(caseData)
    setNewStatus(caseData.case_status)
    setStatusNotes('')
    setStatusModalOpen(true)
  }, [])

  const openNotesModal = useCallback((caseData: Case) => {
    setNotesModalCase(caseData)
    setNotesModalOpen(true)
  }, [])

  const openAmountsModal = useCallback((caseData: Case) => {
    setAmountsModalCase(caseData)
    setEditCompensation(caseData.compensation_amount_eur?.toString() || '0')
    setEditOtherAmount(caseData.other_amount_eur?.toString() || '0')
    setEditOtherNotes(caseData.other_amount_notes || '')
    setAmountsModalOpen(true)
  }, [])

  const handleAmountsSave = async () => {
    if (!amountsModalCase) return

    // Validate amounts - must be valid numbers with max 2 decimal places
    const compValue = parseFloat(editCompensation)
    const otherValue = parseFloat(editOtherAmount)

    if (isNaN(compValue) || compValue < 0 || compValue > 99999999.99) {
      setSnackbar({ open: true, message: 'Invalid compensation amount (0 - 99999999.99)', severity: 'error' })
      return
    }
    if (isNaN(otherValue) || otherValue < -99999999.99 || otherValue > 99999999.99) {
      setSnackbar({ open: true, message: 'Invalid other amount (-99999999.99 to 99999999.99)', severity: 'error' })
      return
    }

    setAmountsSaving(true)
    try {
      const { error } = await supabase
        .from('cases')
        .update({
          compensation_amount_eur: Math.round(compValue * 100) / 100,
          other_amount_eur: Math.round(otherValue * 100) / 100,
          other_amount_notes: editOtherNotes.trim() || null,
        })
        .eq('case_id', amountsModalCase.case_id)

      if (error) {
        console.error('Error updating amounts:', error)
        setSnackbar({ open: true, message: 'Failed to update amounts', severity: 'error' })
      } else {
        setSnackbar({ open: true, message: 'Amounts updated successfully', severity: 'success' })
        setAmountsModalOpen(false)
        setCasesData((prev) =>
          prev.map((c) =>
            c.case_id === amountsModalCase.case_id
              ? {
                  ...c,
                  compensation_amount_eur: Math.round(compValue * 100) / 100,
                  other_amount_eur: Math.round(otherValue * 100) / 100,
                  other_amount_notes: editOtherNotes.trim() || null,
                }
              : c
          )
        )
      }
    } catch (err) {
      console.error('Error updating amounts:', err)
      setSnackbar({ open: true, message: 'Failed to update amounts', severity: 'error' })
    } finally {
      setAmountsSaving(false)
    }
  }

  const handleStatusSave = async () => {
    if (!statusModalCase || !statusNotes.trim()) return

    setStatusSaving(true)
    try {
      // Append new note with timestamp to existing internal_notes
      const timestamp = dayjs().utc().format('YYYY-MM-DD HH:mm')
      const noteEntry = `[${timestamp}] Status: ${statusModalCase.case_status} → ${newStatus}\n${statusNotes.trim()}`
      const updatedNotes = statusModalCase.internal_notes
        ? `${noteEntry}\n\n${statusModalCase.internal_notes}`
        : noteEntry

      const { error } = await supabase
        .from('cases')
        .update({
          case_status: newStatus,
          internal_notes: updatedNotes,
        })
        .eq('case_id', statusModalCase.case_id)

      if (error) {
        console.error('Error updating case status:', error)
        setSnackbar({ open: true, message: 'Failed to update status', severity: 'error' })
      } else {
        setSnackbar({ open: true, message: 'Status updated successfully', severity: 'success' })
        setStatusModalOpen(false)
        // Update local state
        setCasesData((prev) =>
          prev.map((c) =>
            c.case_id === statusModalCase.case_id
              ? { ...c, case_status: newStatus, internal_notes: updatedNotes }
              : c
          )
        )
      }
    } catch (err) {
      console.error('Error updating case status:', err)
      setSnackbar({ open: true, message: 'Failed to update status', severity: 'error' })
    } finally {
      setStatusSaving(false)
    }
  }

  const fetchAuditLog = useCallback(async (caseId: number, shortId: string) => {
    setSelectedCaseId(shortId)
    setAuditModalOpen(true)
    setAuditLoading(true)
    try {
      const { data, error } = await supabase
        .from('cases_audit_log')
        .select('*')
        .eq('case_id', caseId)
        .order('changed_at', { ascending: false })

      if (error) {
        console.error('Error fetching audit log:', error)
        setAuditLogs([])
      } else {
        setAuditLogs(data || [])
      }
    } catch (err) {
      console.error('Error fetching audit log:', err)
      setAuditLogs([])
    } finally {
      setAuditLoading(false)
    }
  }, [])

  useEffect(() => {
    async function fetchCases() {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('cases')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) {
          console.error('Error fetching cases:', error)
          setCasesData([])
        } else {
          setCasesData(data || [])
        }
      } catch (err) {
        console.error('Error fetching cases:', err)
        setCasesData([])
      } finally {
        setLoading(false)
      }
    }

    fetchCases()
  }, [])

  // Fetch status change dates for all cases
  useEffect(() => {
    async function fetchStatusChangeDates() {
      if (casesData.length === 0) return

      const caseIds = casesData.map((c) => c.case_id)

      try {
        // Get the most recent case_status change for each case
        const { data, error } = await supabase
          .from('cases_audit_log')
          .select('case_id, changed_at')
          .in('case_id', caseIds)
          .eq('column_name', 'case_status')
          .order('changed_at', { ascending: false })

        if (error) {
          console.error('Error fetching status change dates:', error)
          return
        }

        // Build a map of case_id -> most recent status change date
        const dateMap = new Map<number, string>()
        for (const row of data || []) {
          // Only keep the first (most recent) change for each case
          if (!dateMap.has(row.case_id)) {
            dateMap.set(row.case_id, row.changed_at)
          }
        }

        setStatusChangeDates(dateMap)
      } catch (err) {
        console.error('Error fetching status change dates:', err)
      }
    }

    fetchStatusChangeDates()
  }, [casesData])

  const formatDateTime = (params: ValueFormatterParams) => {
    if (!params.value) return '--'
    return dayjs(params.value).utc().format('YYYY-MM-DD HH:mm')
  }

  const formatDuration = (startDate: string | null | undefined): string => {
    if (!startDate) return '--'
    const start = dayjs(startDate)
    const now = dayjs()
    const diffDays = now.diff(start, 'day')
    const diffHours = now.diff(start, 'hour') % 24

    if (diffDays > 0) {
      return `${diffDays}d ${diffHours}h`
    }
    const diffMinutes = now.diff(start, 'minute') % 60
    if (diffHours > 0) {
      return `${diffHours}h ${diffMinutes}m`
    }
    return `${diffMinutes}m`
  }

  const getStatusAge = (caseData: Case): string => {
    // If there's a status change in audit log, use that date
    const lastStatusChange = statusChangeDates.get(caseData.case_id)
    if (lastStatusChange) {
      return formatDuration(lastStatusChange)
    }
    // Otherwise, use created_at (status hasn't changed since creation)
    return formatDuration(caseData.created_at)
  }

  const columnDefs: ColDef<Case>[] = useMemo(() => [
    {
      field: 'short_id',
      headerName: 'Case ID',
      filter: true,
      sortable: true,
      width: 100,
      pinned: 'left',
    },
    {
      headerName: 'Files',
      width: 70,
      pinned: 'left',
      sortable: false,
      filter: false,
      cellRenderer: (params: { data: Case }) => {
        if (!params.data?.short_id) return null
        return (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              window.open(`/cases/${params.data.short_id}`, '_blank', 'noopener,noreferrer')
            }}
            sx={{ p: 0.5 }}
          >
            <AttachFileIcon fontSize="small" />
          </IconButton>
        )
      },
    },
    {
      headerName: 'Log',
      width: 60,
      pinned: 'left',
      sortable: false,
      filter: false,
      cellRenderer: (params: { data: Case }) => {
        if (!params.data?.case_id) return null
        return (
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              fetchAuditLog(params.data.case_id, params.data.short_id)
            }}
            sx={{ p: 0.5 }}
          >
            <HistoryIcon fontSize="small" />
          </IconButton>
        )
      },
    },
    {
      headerName: 'Status Age',
      width: 110,
      sortable: true,
      filter: false,
      cellRenderer: (params: { data: Case }) => {
        if (!params.data) return null
        const age = getStatusAge(params.data)
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TimerIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="body2">{age}</Typography>
          </Box>
        )
      },
    },
    {
      field: 'case_status',
      headerName: 'Status',
      filter: true,
      sortable: true,
      width: 180,
      cellRenderer: (params: { data: Case; value: string }) => {
        if (!params.data) return null
        return (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              cursor: 'pointer',
              '&:hover': { color: 'primary.main' },
            }}
            onClick={(e) => {
              e.stopPropagation()
              openStatusModal(params.data)
            }}
          >
            <EditIcon sx={{ fontSize: 14, opacity: 0.6 }} />
            <Typography variant="body2">{params.value}</Typography>
          </Box>
        )
      },
    },
    {
      field: 'case_type',
      headerName: 'Type',
      filter: true,
      sortable: true,
      width: 140,
    },
    {
      field: 'customer_name',
      headerName: 'Customer',
      filter: true,
      sortable: true,
      width: 150,
    },
    {
      field: 'customer_email',
      headerName: 'Email',
      filter: true,
      sortable: true,
      width: 200,
    },
    {
      field: 'customer_phone',
      headerName: 'Phone',
      filter: true,
      sortable: true,
      width: 130,
    },
    {
      field: 'flight_number',
      headerName: 'Flight #',
      filter: true,
      sortable: true,
      width: 100,
    },
    {
      field: 'd_scheduled_time_utc',
      headerName: 'Flight Date (UTC)',
      filter: true,
      sortable: true,
      width: 150,
      valueFormatter: formatDateTime,
    },
    {
      field: 'source_channel',
      headerName: 'Source',
      filter: true,
      sortable: true,
      width: 100,
    },
    {
      field: 'compensation_amount_eur',
      headerName: 'Compensation',
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 140,
      cellRenderer: (params: { data: Case; value: number | null }) => {
        if (!params.data) return null
        const formatted = params.value !== null ? `${Number(params.value).toFixed(2)}` : '0.00'
        return (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              cursor: 'pointer',
              '&:hover': { color: 'primary.main' },
            }}
            onClick={(e) => {
              e.stopPropagation()
              openAmountsModal(params.data)
            }}
          >
            <EuroIcon sx={{ fontSize: 14, opacity: 0.6 }} />
            <Typography variant="body2">{formatted}</Typography>
          </Box>
        )
      },
    },
    {
      field: 'other_amount_eur',
      headerName: 'Other Amount',
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 130,
      cellRenderer: (params: { data: Case; value: number | null }) => {
        if (!params.data) return null
        const formatted = params.value !== null ? `€${Number(params.value).toFixed(2)}` : '€0.00'
        return (
          <Tooltip title={params.data.other_amount_notes || 'Click to edit'} arrow>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                cursor: 'pointer',
                '&:hover': { color: 'primary.main' },
              }}
              onClick={(e) => {
                e.stopPropagation()
                openAmountsModal(params.data)
              }}
            >
              <EditIcon sx={{ fontSize: 14, opacity: 0.6 }} />
              <Typography variant="body2">{formatted}</Typography>
            </Box>
          </Tooltip>
        )
      },
    },
    {
      field: 'lang_code',
      headerName: 'Lang',
      filter: true,
      sortable: true,
      width: 70,
    },
    {
      field: 'campaign_id',
      headerName: 'Campaign',
      filter: 'agNumberColumnFilter',
      sortable: true,
      width: 100,
    },
    {
      field: 'internal_notes',
      headerName: 'Internal Notes',
      filter: true,
      sortable: true,
      flex: 1,
      minWidth: 250,
      cellRenderer: (params: { data: Case; value: string | null }) => {
        if (!params.data) return null
        const notes = params.value || ''
        const firstLine = notes.split('\n')[0] || ''
        const preview = firstLine.length > 50 ? `${firstLine.substring(0, 50)}...` : firstLine
        return (
          <Tooltip title={notes ? 'Click to view full notes' : 'No notes'} arrow>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                cursor: 'pointer',
                '&:hover': { color: 'primary.main' },
                overflow: 'hidden',
              }}
              onClick={(e) => {
                e.stopPropagation()
                openNotesModal(params.data)
              }}
            >
              <NotesIcon sx={{ fontSize: 14, opacity: 0.6, flexShrink: 0 }} />
              <Typography
                variant="body2"
                sx={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {preview || '--'}
              </Typography>
            </Box>
          </Tooltip>
        )
      },
    },
    {
      field: 'created_at',
      headerName: 'Created',
      filter: true,
      sortable: true,
      width: 150,
      valueFormatter: formatDateTime,
    },
    {
      field: 'updated_at',
      headerName: 'Updated',
      filter: true,
      sortable: true,
      width: 150,
      valueFormatter: formatDateTime,
    },
  ], [fetchAuditLog, statusChangeDates, openStatusModal, openNotesModal, openAmountsModal])

  const defaultColDef = useMemo(() => ({
    resizable: true,
  }), [])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Found {casesData.length} case(s)
      </Typography>
      <Box sx={{ height: 600, width: '100%' }}>
        <AgGridReact<Case>
          rowData={casesData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          pagination={true}
          paginationPageSize={20}
          theme={themeQuartz}
          rowHeight={40}
          rowSelection="single"
        />
      </Box>

      <Dialog
        open={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon />
            <Typography variant="h6">Change Log - Case {selectedCaseId}</Typography>
          </Box>
          <IconButton onClick={() => setAuditModalOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {auditLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : auditLogs.length > 0 ? (
            <TableContainer sx={{ maxHeight: 400 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Field</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Old Value</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>New Value</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Changed By</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {auditLogs.map((log) => (
                    <TableRow key={log.audit_id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {dayjs(log.changed_at).utc().format('YYYY-MM-DD HH:mm')}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        {log.column_name}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {log.old_value || '--'}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {log.new_value || '--'}
                      </TableCell>
                      <TableCell>{log.changed_by || '--'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No changes recorded for this case
            </Typography>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            Change Status - Case {statusModalCase?.short_id}
          </Typography>
          <IconButton onClick={() => setStatusModalOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Current Status: <strong>{statusModalCase?.case_status}</strong>
              </Typography>
            </Box>
            <FormControl fullWidth>
              <InputLabel id="new-status-label">New Status</InputLabel>
              <Select
                labelId="new-status-label"
                value={newStatus}
                label="New Status"
                onChange={(e) => setNewStatus(e.target.value)}
              >
                {CASE_STATUSES.map((status) => (
                  <MenuItem key={status} value={status}>
                    {status}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Notes (required)"
              multiline
              rows={4}
              value={statusNotes}
              onChange={(e) => setStatusNotes(e.target.value)}
              placeholder="Explain the reason for this status change..."
              required
              error={statusNotes.trim() === '' && statusSaving}
              helperText="You must provide notes to change the status"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setStatusModalOpen(false)} disabled={statusSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleStatusSave}
            disabled={statusSaving || !statusNotes.trim() || newStatus === statusModalCase?.case_status}
            startIcon={statusSaving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={notesModalOpen}
        onClose={() => setNotesModalOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <NotesIcon />
            <Typography variant="h6">Internal Notes - Case {notesModalCase?.short_id}</Typography>
          </Box>
          <IconButton onClick={() => setNotesModalOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box
            sx={{
              mt: 1,
              p: 2,
              backgroundColor: 'grey.50',
              borderRadius: 1,
              maxHeight: 400,
              overflow: 'auto',
            }}
          >
            <Typography
              variant="body2"
              sx={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
              }}
            >
              {notesModalCase?.internal_notes || 'No notes recorded'}
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>

      <Dialog
        open={amountsModalOpen}
        onClose={() => setAmountsModalOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EuroIcon />
            <Typography variant="h6">Edit Amounts - Case {amountsModalCase?.short_id}</Typography>
          </Box>
          <IconButton onClick={() => setAmountsModalOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Compensation Amount"
              type="number"
              value={editCompensation}
              onChange={(e) => setEditCompensation(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start">€</InputAdornment>,
              }}
              inputProps={{
                min: 0,
                max: 99999999.99,
                step: 0.01,
              }}
              helperText="EC261 compensation amount (0 - 99,999,999.99)"
            />
            <TextField
              label="Other Amount"
              type="number"
              value={editOtherAmount}
              onChange={(e) => setEditOtherAmount(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start">€</InputAdornment>,
              }}
              inputProps={{
                min: -99999999.99,
                max: 99999999.99,
                step: 0.01,
              }}
              helperText="Additional costs or deductions (negative for losses/refunds)"
            />
            <TextField
              label="Other Amount Notes"
              multiline
              rows={3}
              value={editOtherNotes}
              onChange={(e) => setEditOtherNotes(e.target.value)}
              placeholder="Explain what the other amount is for..."
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAmountsModalOpen(false)} disabled={amountsSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAmountsSave}
            disabled={amountsSaving}
            startIcon={amountsSaving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
