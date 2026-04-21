import { useEffect, useState } from 'react'
import Header from './components/Header.jsx'
import UploadPanel from './components/UploadPanel.jsx'
import AnalysisCard from './components/AnalysisCard.jsx'
import DetailModal from './components/DetailModal.jsx'
import ClientsManager from './components/ClientsManager.jsx'
import SignInGate from './components/SignInGate.jsx'
import { api, getPassword, clearPassword } from './api.js'

export default function App() {
  const [authed, setAuthed] = useState(!!getPassword())
  const [records, setRecords] = useState([])
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [clients, setClients] = useState([])
  const [loadingClients, setLoadingClients] = useState(false)
  const [selected, setSelected] = useState(null)
  const [clientsOpen, setClientsOpen] = useState(false)
  const [topError, setTopError] = useState('')

  useEffect(() => {
    if (!authed) return
    loadRecords()
    loadClients()
  }, [authed])

  const loadRecords = async () => {
    setLoadingRecords(true); setTopError('')
    try {
      const data = await api.listRecords()
      setRecords(data.records || [])
    } catch (err) {
      setTopError(err.message)
      if (err.message?.includes('sign in')) setAuthed(false)
    } finally {
      setLoadingRecords(false)
    }
  }

  const loadClients = async () => {
    setLoadingClients(true)
    try {
      const data = await api.listClients()
      setClients(data.clients || [])
    } catch (err) {
      console.error('Failed to load clients:', err)
      if (err.message?.includes('sign in')) setAuthed(false)
    } finally {
      setLoadingClients(false)
    }
  }

  const handleAnalysisComplete = (newRecord) => {
    setRecords((prev) => [newRecord, ...prev.filter((r) => r.id !== newRecord.id)])
    setSelected(newRecord)
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this analysis? This also removes all generated ad copy.')) return
    try {
      await api.deleteRecord(id)
      setRecords((prev) => prev.filter((r) => r.id !== id))
      if (selected?.id === id) setSelected(null)
    } catch (err) {
      alert('Delete failed: ' + err.message)
    }
  }

  const handleRecordUpdate = (updated) => {
    setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    setSelected(updated)
  }

  const signOut = () => {
    clearPassword()
    setAuthed(false)
    setRecords([])
    setClients([])
  }

  if (!authed) {
    return <SignInGate onSignIn={() => setAuthed(true)} />
  }

  return (
    <div className="app">
      <Header
        user={{ email: 'team' }}
        clientCount={clients.length}
        onManageClients={() => setClientsOpen(true)}
        onSignOut={signOut}
      />

      <main className="main">
        <UploadPanel onAnalysisComplete={handleAnalysisComplete} />

        <section className="dash">
          <div className="dash-head">
            <h2 className="dash-title">Team Analyses</h2>
            <span className="dash-count">
              {loadingRecords ? 'loading…' : `${records.length} total`}
            </span>
          </div>

          {topError && <div className="inline-error">{topError}</div>}

          {!loadingRecords && records.length === 0 && (
            <div className="empty-state">
              <div className="empty-title">No analyses yet</div>
              <div className="empty-sub">Drop in a video above to run your first GEM analysis.</div>
            </div>
          )}

          <div className="card-grid-outer">
            {records.map((r) => (
              <AnalysisCard
                key={r.id}
                record={r}
                onOpen={() => setSelected(r)}
                onDelete={() => handleDelete(r.id)}
              />
            ))}
          </div>
        </section>
      </main>

      {selected && (
        <DetailModal
          record={selected}
          clients={clients}
          onClose={() => setSelected(null)}
          onUpdate={handleRecordUpdate}
        />
      )}

      {clientsOpen && (
        <ClientsManager
          initialClients={clients}
          onClose={() => setClientsOpen(false)}
          onClientsChanged={loadClients}
        />
      )}

      <footer className="footer">
        <span>analysis: <code>gemini-2.5-pro</code></span>
        <span>·</span>
        <span>copy: <code>openai</code></span>
        <span>·</span>
        <span>store: <code>supabase</code></span>
      </footer>
    </div>
  )
}
