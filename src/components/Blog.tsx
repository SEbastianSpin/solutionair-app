import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Snackbar,
  Switch,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import CloseIcon from '@mui/icons-material/Close'
import ImageIcon from '@mui/icons-material/Image'
import VisibilityIcon from '@mui/icons-material/Visibility'
import CodeIcon from '@mui/icons-material/Code'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import DeleteIcon from '@mui/icons-material/Delete'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { AgGridReact } from 'ag-grid-react'
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community'
import type { ColDef, ValueFormatterParams } from 'ag-grid-community'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import ReactMarkdown from 'react-markdown'
import { supabase } from '../lib/supabase'

dayjs.extend(utc)
ModuleRegistry.registerModules([AllCommunityModule])

interface Post {
  id: string
  slug: string
  image_url: string | null
  published_at: string | null
  is_active: boolean
}

interface PostTranslation {
  id: string
  post_id: string
  language_code: string
  title: string
  content: string
  excerpt: string | null
}

interface PostImage {
  id: string
  post_id: string
  url: string
  alt_text: string | null
  display_order: number
  created_at: string
}

interface PostWithTranslation extends Post {
  title: string | null
  excerpt: string | null
  language_code: string | null
  translations: PostTranslation[]
  images?: PostImage[]
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
]

const BLOG_BUCKET = 'blog_img'

// Convert string to URL-friendly slug
const toSlug = (str: string): string => {
  return str
    .toLowerCase()
    .trim()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ñ]/g, 'n')
    .replace(/[ç]/g, 'c')
    .replace(/[ł]/g, 'l')
    .replace(/[ż]/g, 'z')
    .replace(/[ź]/g, 'z')
    .replace(/[ś]/g, 's')
    .replace(/[ć]/g, 'c')
    .replace(/[ń]/g, 'n')
    .replace(/[ą]/g, 'a')
    .replace(/[ę]/g, 'e')
    .replace(/[ó]/g, 'o')
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w-]+/g, '')        // Remove all non-word chars except -
    .replace(/--+/g, '-')           // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start
    .replace(/-+$/, '')             // Trim - from end
}

// Validate slug format - allows lowercase letters, numbers, and hyphens
// Must start and end with alphanumeric, no consecutive hyphens
const isValidSlug = (slug: string): boolean => {
  if (!slug) return false
  // Allow slugs with hyphens between alphanumeric characters
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
}

// Check if slug is valid for typing (more permissive, allows trailing hyphen)
const isValidSlugInput = (slug: string): boolean => {
  if (!slug) return true
  // Allow during typing: lowercase, numbers, single hyphens (not at start, not consecutive)
  return /^[a-z0-9]+(-[a-z0-9]*)*$/.test(slug)
}

export default function Blog() {
  const [posts, setPosts] = useState<PostWithTranslation[]>([])
  const [loading, setLoading] = useState(true)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<PostWithTranslation | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  // Form state
  const [editSlug, setEditSlug] = useState('')
  const [editImageUrl, setEditImageUrl] = useState('')
  const [editIsActive, setEditIsActive] = useState(true)
  const [editTranslations, setEditTranslations] = useState<Record<string, { title: string; content: string; excerpt: string }>>({})
  const [slugError, setSlugError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadingContentImage, setUploadingContentImage] = useState(false)
  const [postImages, setPostImages] = useState<PostImage[]>([])
  const [newImageAlt, setNewImageAlt] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const contentImageInputRef = useRef<HTMLInputElement>(null)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch posts
      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select('*')
        .order('published_at', { ascending: false })

      if (postsError) {
        console.error('Error fetching posts:', postsError)
        setPosts([])
        return
      }

      // Fetch all translations
      const { data: translationsData, error: translationsError } = await supabase
        .from('post_translations')
        .select('*')

      if (translationsError) {
        console.error('Error fetching translations:', translationsError)
      }

      // Combine posts with translations
      const postsWithTranslations: PostWithTranslation[] = (postsData || []).map((post) => {
        const postTranslations = (translationsData || []).filter((t) => t.post_id === post.id)
        const primaryTranslation = postTranslations.find((t) => t.language_code === 'en') || postTranslations[0]

        return {
          ...post,
          title: primaryTranslation?.title || null,
          excerpt: primaryTranslation?.excerpt || null,
          language_code: primaryTranslation?.language_code || null,
          translations: postTranslations,
        }
      })

      setPosts(postsWithTranslations)
    } catch (err) {
      console.error('Error fetching posts:', err)
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  const handleSlugChange = (value: string) => {
    // Convert to lowercase and allow only valid slug characters
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setEditSlug(cleaned)

    // Validate during typing (more permissive)
    if (cleaned && !isValidSlugInput(cleaned)) {
      setSlugError('Slug must start with a letter/number, no consecutive hyphens')
    } else if (cleaned && cleaned.startsWith('-')) {
      setSlugError('Slug cannot start with a hyphen')
    } else {
      setSlugError('')
    }
  }

  // Convert image to webp using Canvas API
  const convertToWebp = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Could not get canvas context'))
          return
        }
        ctx.drawImage(img, 0, 0)
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(new Error('Could not convert to webp'))
            }
          },
          'image/webp',
          0.85 // quality
        )
      }
      img.onerror = () => reject(new Error('Could not load image'))
      img.src = URL.createObjectURL(file)
    })
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Check file type - accept common image formats
    const allowedTypes = ['image/webp', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      setSnackbar({ open: true, message: 'Only image files (webp, jpg, png, gif) are allowed', severity: 'error' })
      return
    }

    // Check file size (max 10MB for source, will be compressed)
    if (file.size > 10 * 1024 * 1024) {
      setSnackbar({ open: true, message: 'Image must be less than 10MB', severity: 'error' })
      return
    }

    setUploading(true)
    try {
      let uploadBlob: Blob = file

      // Convert to webp if not already
      if (file.type !== 'image/webp') {
        uploadBlob = await convertToWebp(file)
      }

      // Generate friendly filename from title and date
      const titleForFilename = editTranslations['en']?.title || editTranslations[Object.keys(editTranslations)[0]]?.title || editSlug || 'post'
      const slugifiedTitle = toSlug(titleForFilename).substring(0, 50) // Limit length
      const dateStr = dayjs().format('YYYY-MM-DD')
      const uniqueSuffix = Math.random().toString(36).substring(2, 6) // Short random suffix
      const filename = `${slugifiedTitle}-${dateStr}-${uniqueSuffix}.webp`

      const { data, error } = await supabase.storage
        .from(BLOG_BUCKET)
        .upload(filename, uploadBlob, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'image/webp',
        })

      if (error) {
        console.error('Error uploading image:', error)
        setSnackbar({ open: true, message: `Upload failed: ${error.message}`, severity: 'error' })
        return
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(BLOG_BUCKET)
        .getPublicUrl(data.path)

      setEditImageUrl(urlData.publicUrl)
      setSnackbar({ open: true, message: 'Image uploaded successfully', severity: 'success' })
    } catch (err) {
      console.error('Error uploading image:', err)
      setSnackbar({ open: true, message: 'Failed to upload image', severity: 'error' })
    } finally {
      setUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Fetch post images for a specific post
  const fetchPostImages = async (postId: string) => {
    const { data, error } = await supabase
      .from('post_images')
      .select('*')
      .eq('post_id', postId)
      .order('display_order', { ascending: true })

    if (error) {
      console.error('Error fetching post images:', error)
      return []
    }
    return data || []
  }

  // Upload a content image for the post
  const handleContentImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!editingPost && isCreating) {
      setSnackbar({ open: true, message: 'Please save the post first before adding content images', severity: 'error' })
      return
    }

    const allowedTypes = ['image/webp', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      setSnackbar({ open: true, message: 'Only image files (webp, jpg, png, gif) are allowed', severity: 'error' })
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setSnackbar({ open: true, message: 'Image must be less than 10MB', severity: 'error' })
      return
    }

    setUploadingContentImage(true)
    try {
      let uploadBlob: Blob = file
      if (file.type !== 'image/webp') {
        uploadBlob = await convertToWebp(file)
      }

      const timestamp = Date.now()
      const filename = `content-${editSlug || 'img'}-${timestamp}.webp`

      const { data, error } = await supabase.storage
        .from(BLOG_BUCKET)
        .upload(filename, uploadBlob, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'image/webp',
        })

      if (error) {
        setSnackbar({ open: true, message: `Upload failed: ${error.message}`, severity: 'error' })
        return
      }

      const { data: urlData } = supabase.storage
        .from(BLOG_BUCKET)
        .getPublicUrl(data.path)

      // Save to post_images table
      const { data: imageData, error: dbError } = await supabase
        .from('post_images')
        .insert({
          post_id: editingPost!.id,
          url: urlData.publicUrl,
          alt_text: newImageAlt.trim() || null,
          display_order: postImages.length,
        })
        .select()
        .single()

      if (dbError) {
        setSnackbar({ open: true, message: `Failed to save image: ${dbError.message}`, severity: 'error' })
        return
      }

      setPostImages((prev) => [...prev, imageData])
      setNewImageAlt('')

      // Copy markdown to clipboard
      const markdown = `![${newImageAlt || 'image'}](${urlData.publicUrl})`
      await navigator.clipboard.writeText(markdown)
      setSnackbar({ open: true, message: 'Image uploaded! Markdown copied to clipboard', severity: 'success' })
    } catch (err) {
      console.error('Error uploading content image:', err)
      setSnackbar({ open: true, message: 'Failed to upload image', severity: 'error' })
    } finally {
      setUploadingContentImage(false)
      if (contentImageInputRef.current) {
        contentImageInputRef.current.value = ''
      }
    }
  }

  // Delete a content image
  const handleDeleteContentImage = async (image: PostImage) => {
    try {
      // Delete from database
      const { error } = await supabase
        .from('post_images')
        .delete()
        .eq('id', image.id)

      if (error) {
        setSnackbar({ open: true, message: `Failed to delete: ${error.message}`, severity: 'error' })
        return
      }

      setPostImages((prev) => prev.filter((img) => img.id !== image.id))
      setSnackbar({ open: true, message: 'Image deleted', severity: 'success' })
    } catch (err) {
      console.error('Error deleting image:', err)
    }
  }

  // Copy markdown syntax to clipboard
  const copyMarkdownToClipboard = async (image: PostImage) => {
    const markdown = `![${image.alt_text || 'image'}](${image.url})`
    await navigator.clipboard.writeText(markdown)
    setSnackbar({ open: true, message: 'Markdown copied to clipboard', severity: 'success' })
  }

  const openEditModal = useCallback(async (post: PostWithTranslation | null) => {
    if (post) {
      setIsCreating(false)
      setEditingPost(post)
      setEditSlug(post.slug)
      setEditImageUrl(post.image_url || '')
      setEditIsActive(post.is_active)
      setSlugError('')

      // Initialize translations
      const translationsMap: Record<string, { title: string; content: string; excerpt: string }> = {}
      post.translations.forEach((t) => {
        translationsMap[t.language_code] = {
          title: t.title,
          content: t.content,
          excerpt: t.excerpt || '',
        }
      })
      setEditTranslations(translationsMap)
      setActiveTab(0)

      // Fetch post images
      const images = await fetchPostImages(post.id)
      setPostImages(images)
    } else {
      setIsCreating(true)
      setEditingPost(null)
      setEditSlug('')
      setEditImageUrl('')
      setEditIsActive(true)
      setSlugError('')
      setEditTranslations({
        en: { title: '', content: '', excerpt: '' },
      })
      setActiveTab(0)
      setPostImages([])
    }
    setNewImageAlt('')
    setViewMode('edit')
    setEditModalOpen(true)
  }, [])

  const handleSave = async () => {
    if (!editSlug.trim()) {
      setSnackbar({ open: true, message: 'Slug is required', severity: 'error' })
      return
    }

    // Clean trailing hyphens for final validation
    const finalSlug = editSlug.replace(/-+$/, '')
    if (!isValidSlug(finalSlug)) {
      setSnackbar({ open: true, message: 'Invalid slug format. Use lowercase letters, numbers, and hyphens only (no trailing hyphens).', severity: 'error' })
      return
    }

    // Check if at least one translation has title and content
    const hasValidTranslation = Object.values(editTranslations).some(
      (t) => t.title.trim() && t.content.trim()
    )
    if (!hasValidTranslation) {
      setSnackbar({ open: true, message: 'At least one translation with title and content is required', severity: 'error' })
      return
    }

    setSaving(true)
    try {
      if (isCreating) {
        // Create new post
        const { data: newPost, error: postError } = await supabase
          .from('posts')
          .insert({
            slug: finalSlug,
            image_url: editImageUrl.trim() || null,
            is_active: editIsActive,
            published_at: new Date().toISOString(),
          })
          .select()
          .single()

        if (postError) {
          console.error('Error creating post:', postError)
          setSnackbar({ open: true, message: `Failed to create post: ${postError.message}`, severity: 'error' })
          return
        }

        // Create translations
        const translationsToInsert = Object.entries(editTranslations)
          .filter(([, t]) => t.title.trim() && t.content.trim())
          .map(([langCode, t]) => ({
            post_id: newPost.id,
            language_code: langCode,
            title: t.title.trim(),
            content: t.content.trim(),
            excerpt: t.excerpt.trim() || null,
          }))

        console.log('Translations to insert:', translationsToInsert)

        if (translationsToInsert.length > 0) {
          const { data: transData, error: transError } = await supabase
            .from('post_translations')
            .insert(translationsToInsert)
            .select()

          if (transError) {
            console.error('Error creating translations:', transError)
            setSnackbar({ open: true, message: `Post created but translations failed: ${transError.message}`, severity: 'error' })
            setEditModalOpen(false)
            fetchPosts()
            return
          }
          console.log('Translations created:', transData)
        }

        setSnackbar({ open: true, message: 'Post created successfully', severity: 'success' })
      } else if (editingPost) {
        // Update existing post
        const { error: postError } = await supabase
          .from('posts')
          .update({
            slug: finalSlug,
            image_url: editImageUrl.trim() || null,
            is_active: editIsActive,
          })
          .eq('id', editingPost.id)

        if (postError) {
          console.error('Error updating post:', postError)
          setSnackbar({ open: true, message: `Failed to update post: ${postError.message}`, severity: 'error' })
          return
        }

        // Get current language codes from editTranslations
        const currentLangCodes = Object.keys(editTranslations).filter(
          (langCode) => editTranslations[langCode].title.trim() && editTranslations[langCode].content.trim()
        )

        // Delete translations for languages that are no longer in the list
        if (currentLangCodes.length > 0) {
          const { error: deleteError } = await supabase
            .from('post_translations')
            .delete()
            .eq('post_id', editingPost.id)
            .not('language_code', 'in', `(${currentLangCodes.join(',')})`)

          if (deleteError) {
            console.error('Error deleting removed translations:', deleteError)
          }
        }

        // Upsert translations (update existing, insert new)
        const translationsToUpsert = Object.entries(editTranslations)
          .filter(([, t]) => t.title.trim() && t.content.trim())
          .map(([langCode, t]) => ({
            post_id: editingPost.id,
            language_code: langCode,
            title: t.title.trim(),
            content: t.content.trim(),
            excerpt: t.excerpt.trim() || null,
          }))

        console.log('Translations to upsert:', translationsToUpsert)

        if (translationsToUpsert.length > 0) {
          const { data: transData, error: transError } = await supabase
            .from('post_translations')
            .upsert(translationsToUpsert, {
              onConflict: 'post_id,language_code',
            })
            .select()

          if (transError) {
            console.error('Error upserting translations:', transError)
            setSnackbar({ open: true, message: `Post updated but translations failed: ${transError.message}`, severity: 'error' })
            setEditModalOpen(false)
            fetchPosts()
            return
          }
          console.log('Translations upserted:', transData)
        }

        setSnackbar({ open: true, message: 'Post updated successfully', severity: 'success' })
      }

      setEditModalOpen(false)
      fetchPosts()
    } catch (err) {
      console.error('Error saving post:', err)
      setSnackbar({ open: true, message: 'Failed to save post', severity: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (post: PostWithTranslation) => {
    try {
      const { error } = await supabase
        .from('posts')
        .update({ is_active: !post.is_active })
        .eq('id', post.id)

      if (error) {
        console.error('Error toggling post status:', error)
        setSnackbar({ open: true, message: 'Failed to update post status', severity: 'error' })
        return
      }

      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, is_active: !p.is_active } : p))
      )
    } catch (err) {
      console.error('Error toggling post status:', err)
    }
  }

  const formatDateTime = (params: ValueFormatterParams) => {
    if (!params.value) return '--'
    return dayjs(params.value).utc().format('YYYY-MM-DD HH:mm')
  }

  const columnDefs: ColDef<PostWithTranslation>[] = useMemo(
    () => [
      {
        headerName: 'Edit',
        width: 70,
        pinned: 'left',
        sortable: false,
        filter: false,
        cellRenderer: (params: { data: PostWithTranslation }) => {
          if (!params.data) return null
          return (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation()
                openEditModal(params.data)
              }}
              sx={{ p: 0.5 }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          )
        },
      },
      {
        field: 'is_active',
        headerName: 'Active',
        width: 90,
        cellRenderer: (params: { data: PostWithTranslation; value: boolean }) => {
          if (!params.data) return null
          return (
            <Switch
              size="small"
              checked={params.value}
              onChange={(e) => {
                e.stopPropagation()
                handleToggleActive(params.data)
              }}
            />
          )
        },
      },
      {
        field: 'title',
        headerName: 'Title',
        filter: true,
        sortable: true,
        flex: 1,
        minWidth: 200,
      },
      {
        field: 'slug',
        headerName: 'Slug',
        filter: true,
        sortable: true,
        width: 180,
      },
      {
        headerName: 'Languages',
        width: 150,
        cellRenderer: (params: { data: PostWithTranslation }) => {
          if (!params.data) return null
          return (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {params.data.translations.map((t) => (
                <Chip
                  key={t.language_code}
                  label={t.language_code.toUpperCase()}
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.7rem' }}
                />
              ))}
            </Box>
          )
        },
      },
      {
        field: 'image_url',
        headerName: 'Image',
        width: 80,
        cellRenderer: (params: { value: string | null }) => {
          if (!params.value) return '--'
          return (
            <IconButton
              size="small"
              onClick={() => window.open(params.value!, '_blank')}
              sx={{ p: 0.5 }}
            >
              <ImageIcon fontSize="small" />
            </IconButton>
          )
        },
      },
      {
        field: 'excerpt',
        headerName: 'Excerpt',
        filter: true,
        sortable: true,
        width: 250,
        valueFormatter: (params: ValueFormatterParams) => {
          if (!params.value) return '--'
          const text = params.value as string
          return text.length > 50 ? `${text.substring(0, 50)}...` : text
        },
      },
      {
        field: 'published_at',
        headerName: 'Published',
        filter: true,
        sortable: true,
        width: 150,
        valueFormatter: formatDateTime,
      },
    ],
    [openEditModal]
  )

  const defaultColDef = useMemo(
    () => ({
      resizable: true,
    }),
    []
  )

  const handleTranslationChange = (langCode: string, field: 'title' | 'content' | 'excerpt', value: string) => {
    setEditTranslations((prev) => ({
      ...prev,
      [langCode]: {
        ...(prev[langCode] || { title: '', content: '', excerpt: '' }),
        [field]: value,
      },
    }))
  }

  const addLanguage = (langCode: string) => {
    if (!editTranslations[langCode]) {
      setEditTranslations((prev) => ({
        ...prev,
        [langCode]: { title: '', content: '', excerpt: '' },
      }))
    }
  }

  const removeLanguage = (langCode: string) => {
    setEditTranslations((prev) => {
      const newTranslations = { ...prev }
      delete newTranslations[langCode]
      return newTranslations
    })
  }

  const activeLanguages = Object.keys(editTranslations)
  const availableLanguages = LANGUAGES.filter((l) => !activeLanguages.includes(l.code))
  const currentLangCode = activeLanguages[activeTab] || 'en'

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {posts.length} post(s)
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => openEditModal(null)}
          size="small"
        >
          New Post
        </Button>
      </Box>

      <Box sx={{ height: 600, width: '100%' }}>
        <AgGridReact<PostWithTranslation>
          rowData={posts}
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
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            {isCreating ? 'Create New Post' : `Edit Post: ${editingPost?.slug}`}
          </Typography>
          <IconButton onClick={() => setEditModalOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {/* Post Details */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Slug"
                value={editSlug}
                onChange={(e) => handleSlugChange(e.target.value)}
                required
                error={!!slugError}
                sx={{ flex: 1 }}
                helperText={slugError || "URL-friendly identifier (e.g., my-blog-post)"}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                  />
                }
                label="Active"
              />
            </Box>

            {/* Featured Image Upload */}
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Featured Image</Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/webp,image/jpeg,image/png,image/gif"
                    onChange={handleImageUpload}
                    style={{ display: 'none' }}
                    id="image-upload"
                  />
                  <label htmlFor="image-upload">
                    <Button
                      variant="outlined"
                      component="span"
                      startIcon={uploading ? <CircularProgress size={16} /> : <CloudUploadIcon />}
                      disabled={uploading}
                    >
                      {uploading ? 'Converting & Uploading...' : 'Upload Image'}
                    </Button>
                  </label>
                  {editImageUrl && (
                    <Button
                      variant="text"
                      size="small"
                      color="error"
                      onClick={() => setEditImageUrl('')}
                    >
                      Remove
                    </Button>
                  )}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  Accepts jpg, png, gif, webp (max 10MB) - auto-converts to webp
                </Typography>
              </Box>
              {editImageUrl && (
                <Box
                  sx={{
                    width: 120,
                    height: 80,
                    borderRadius: 1,
                    overflow: 'hidden',
                    border: 1,
                    borderColor: 'divider',
                  }}
                >
                  <img
                    src={editImageUrl}
                    alt="Preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </Box>
              )}
            </Box>

            {/* Content Images - only show for existing posts */}
            {!isCreating && editingPost && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Content Images</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Upload images to use in your content. Markdown will be copied to clipboard automatically.
                </Typography>

                {/* Upload new image */}
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
                  <TextField
                    size="small"
                    label="Alt text (optional)"
                    value={newImageAlt}
                    onChange={(e) => setNewImageAlt(e.target.value)}
                    sx={{ width: 200 }}
                  />
                  <input
                    ref={contentImageInputRef}
                    type="file"
                    accept="image/webp,image/jpeg,image/png,image/gif"
                    onChange={handleContentImageUpload}
                    style={{ display: 'none' }}
                    id="content-image-upload"
                  />
                  <label htmlFor="content-image-upload">
                    <Button
                      variant="outlined"
                      component="span"
                      size="small"
                      startIcon={uploadingContentImage ? <CircularProgress size={14} /> : <CloudUploadIcon />}
                      disabled={uploadingContentImage}
                    >
                      {uploadingContentImage ? 'Uploading...' : 'Upload'}
                    </Button>
                  </label>
                </Box>

                {/* List of existing images */}
                {postImages.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {postImages.map((image) => (
                      <Box
                        key={image.id}
                        sx={{
                          position: 'relative',
                          width: 100,
                          border: 1,
                          borderColor: 'divider',
                          borderRadius: 1,
                          overflow: 'hidden',
                        }}
                      >
                        <img
                          src={image.url}
                          alt={image.alt_text || 'content image'}
                          style={{ width: '100%', height: 60, objectFit: 'cover' }}
                        />
                        <Box sx={{ p: 0.5, backgroundColor: 'grey.100' }}>
                          <Typography variant="caption" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {image.alt_text || 'No alt'}
                          </Typography>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                            <IconButton
                              size="small"
                              onClick={() => copyMarkdownToClipboard(image)}
                              title="Copy markdown"
                              sx={{ p: 0.25 }}
                            >
                              <ContentCopyIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleDeleteContentImage(image)}
                              title="Delete"
                              color="error"
                              sx={{ p: 0.25 }}
                            >
                              <DeleteIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Box>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            )}

            {/* Translations Tabs */}
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="subtitle2">Translations</Typography>
                {availableLanguages.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {availableLanguages.map((lang) => (
                      <Chip
                        key={lang.code}
                        label={`+ ${lang.label}`}
                        size="small"
                        onClick={() => addLanguage(lang.code)}
                        sx={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Box>
                )}
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: 1, borderColor: 'divider' }}>
                <Tabs
                  value={activeTab}
                  onChange={(_, newValue) => setActiveTab(newValue)}
                  variant="scrollable"
                  scrollButtons="auto"
                >
                  {activeLanguages.map((langCode) => {
                    const lang = LANGUAGES.find((l) => l.code === langCode)
                    return (
                      <Tab
                        key={langCode}
                        label={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {lang?.label || langCode.toUpperCase()}
                            {activeLanguages.length > 1 && (
                              <CloseIcon
                                sx={{ fontSize: 14, ml: 0.5 }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeLanguage(langCode)
                                  if (activeTab >= activeLanguages.length - 1) {
                                    setActiveTab(Math.max(0, activeTab - 1))
                                  }
                                }}
                              />
                            )}
                          </Box>
                        }
                      />
                    )
                  })}
                </Tabs>
                <ToggleButtonGroup
                  value={viewMode}
                  exclusive
                  onChange={(_, newMode) => newMode && setViewMode(newMode)}
                  size="small"
                  sx={{ mr: 1 }}
                >
                  <ToggleButton value="edit">
                    <CodeIcon sx={{ mr: 0.5, fontSize: 18 }} />
                    Edit
                  </ToggleButton>
                  <ToggleButton value="preview">
                    <VisibilityIcon sx={{ mr: 0.5, fontSize: 18 }} />
                    Preview
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {activeLanguages.map((langCode, index) => (
                <Box
                  key={langCode}
                  role="tabpanel"
                  hidden={activeTab !== index}
                  sx={{ pt: 2 }}
                >
                  {activeTab === index && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <TextField
                        label="Title"
                        value={editTranslations[langCode]?.title || ''}
                        onChange={(e) => handleTranslationChange(langCode, 'title', e.target.value)}
                        required
                        fullWidth
                      />
                      <TextField
                        label="Excerpt"
                        value={editTranslations[langCode]?.excerpt || ''}
                        onChange={(e) => handleTranslationChange(langCode, 'excerpt', e.target.value)}
                        fullWidth
                        multiline
                        rows={2}
                        helperText="Short summary for previews"
                      />

                      {viewMode === 'edit' ? (
                        <TextField
                          label="Content (Markdown)"
                          value={editTranslations[langCode]?.content || ''}
                          onChange={(e) => handleTranslationChange(langCode, 'content', e.target.value)}
                          required
                          fullWidth
                          multiline
                          rows={15}
                          helperText="Full post content (supports markdown formatting)"
                          sx={{
                            '& .MuiInputBase-input': {
                              fontFamily: 'monospace',
                              fontSize: '0.875rem',
                            },
                          }}
                        />
                      ) : (
                        <Box
                          sx={{
                            border: 1,
                            borderColor: 'divider',
                            borderRadius: 1,
                            p: 2,
                            minHeight: 400,
                            maxHeight: 500,
                            overflow: 'auto',
                            backgroundColor: 'grey.50',
                            '& h1': { fontSize: '2rem', fontWeight: 700, mt: 0, mb: 2 },
                            '& h2': { fontSize: '1.5rem', fontWeight: 600, mt: 3, mb: 1.5 },
                            '& h3': { fontSize: '1.25rem', fontWeight: 600, mt: 2, mb: 1 },
                            '& p': { mb: 1.5, lineHeight: 1.7 },
                            '& ul, & ol': { pl: 3, mb: 1.5 },
                            '& li': { mb: 0.5 },
                            '& code': {
                              backgroundColor: 'grey.200',
                              px: 0.5,
                              py: 0.25,
                              borderRadius: 0.5,
                              fontFamily: 'monospace',
                              fontSize: '0.875rem',
                            },
                            '& pre': {
                              backgroundColor: 'grey.900',
                              color: 'grey.100',
                              p: 2,
                              borderRadius: 1,
                              overflow: 'auto',
                              '& code': {
                                backgroundColor: 'transparent',
                                color: 'inherit',
                              },
                            },
                            '& blockquote': {
                              borderLeft: 4,
                              borderColor: 'primary.main',
                              pl: 2,
                              ml: 0,
                              fontStyle: 'italic',
                              color: 'text.secondary',
                            },
                            '& img': {
                              maxWidth: '100%',
                              height: 'auto',
                              borderRadius: 1,
                            },
                            '& a': {
                              color: 'primary.main',
                              textDecoration: 'underline',
                            },
                            '& hr': {
                              border: 'none',
                              borderTop: 1,
                              borderColor: 'divider',
                              my: 3,
                            },
                            '& table': {
                              width: '100%',
                              borderCollapse: 'collapse',
                              mb: 2,
                            },
                            '& th, & td': {
                              border: 1,
                              borderColor: 'divider',
                              p: 1,
                              textAlign: 'left',
                            },
                            '& th': {
                              backgroundColor: 'grey.100',
                              fontWeight: 600,
                            },
                          }}
                        >
                          {editTranslations[currentLangCode]?.content ? (
                            <ReactMarkdown>
                              {editTranslations[currentLangCode].content}
                            </ReactMarkdown>
                          ) : (
                            <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
                              No content to preview. Switch to Edit mode to add content.
                            </Typography>
                          )}
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditModalOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !editSlug.trim() || !!slugError || uploading}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {isCreating ? 'Create' : 'Save'}
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
