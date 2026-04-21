import { useEffect, useState } from 'react'
import { api } from '../api.js'

const EMPTY_FORM = {
  business_name: '',
  location: '',
  vertical: '',
  tone_voice: '',
  notes: '',
  website_url: '',
  brand_summary: '',
  brand_fonts: '',
  primary_color: '',
  secondary_color: '',
  accent_color: '',
  logo_url: '',
  logo_storage_path: '',
  reference_photos: []
}

export default function ClientsManager({ onClose, onClientsChanged, initialClients = [] }) {
  const [clients, setClients] = useState(initialClients)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('list')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [scraping, setScraping] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const data = await api.listClients()
      setClients(data.clients || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && mode === 'list') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, onClose])

  useEffect(() => { load() }, [])

  const startNew = () => {
    setEditing(null); setForm(EMPTY_FORM); setError(''); setMode('edit')
  }

  const startEdit = (client) => {
    setEditing(client)
    setForm({
      business_name: client.business_name || '',
      location: client.location || '',
      vertical: client.vertical || '',
      tone_voice: client.tone_voice || '',
      notes: client.notes || '',
      website_url: client.website_url || '',
      brand_summary: client.brand_summary || '',
      brand_fonts: client.brand_fonts || '',
      primary_color: client.primary_color || '',
      secondary_color: client.secondary_color || '',
      accent_color: client.accent_color || '',
      logo_url: client.logo_url || '',
      logo_storage_path: client.logo_storage_path || '',
      reference_photos: Array.isArray(client.reference_photos) ? client.reference_photos : []
    })
    setError(''); setMode('edit')
  }

  const scrapeWebsite = async () => {
    if (!form.website_url.trim()) { setError('Enter a website URL first'); return }
    setScraping(true); setError('')
    try {
      const result = await api.scrapeWebsite(form.website_url.trim())
      setForm({
        ...form,
        brand_summary: result.summary || form.brand_summary,
        website_url: result.url || form.website_url
      })
    } catch (err) {
      setError(`Scrape failed: ${err.message}`)
    } finally {
      setScraping(false)
    }
  }

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true); setError('')
    try {
      const result = await api.uploadClientAsset(file, 'logo', editing?.id)
      setForm({ ...form, logo_url: result.asset.url, logo_storage_path: result.asset.storage_path })
    } catch (err) {
      setError(`Logo upload failed: ${err.message}`)
    } finally {
      setUploadingLogo(false)
      e.target.value = ''
    }
  }

  const uploadReferencePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true); setError('')
    try {
      const result = await api.uploadClientAsset(file, 'reference
