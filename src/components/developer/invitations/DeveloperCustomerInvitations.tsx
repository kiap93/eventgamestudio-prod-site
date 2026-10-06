import React, { useState, useEffect, useMemo } from 'react';
import { useLocalization } from '../../../context/LocalizationContext';
import { apiFetch } from '../../../lib/api';
import {
  Building2,
  Mail,
  UserPlus,
  Send,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Eye,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Info,
  Copy,
  Check,
  X,
  FileText,
  Users,
  ShieldAlert,
} from 'lucide-react';

export interface CustomerRecipient {
  id: string;
  company_id: string;
  recipient_name: string | null;
  email: string;
  invitation_count: number;
  last_invited_at: string | null;
  last_invitation_status: 'never_invited' | 'sent' | 'failed';
  last_invitation_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerCompany {
  id: string;
  company_name: string;
  contact_person: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  recipients: CustomerRecipient[];
  totalRecipients: number;
  neverInvitedCount: number;
  previouslyInvitedCount: number;
  lastInvitedAt: string | null;
  invitationStatus: 'never_invited' | 'partially_invited' | 'all_invited';
}

export interface CustomerInvitationLog {
  id: string;
  company_id: string;
  recipient_id: string;
  email: string;
  subject: string;
  provider: string;
  provider_message_id: string | null;
  status: 'sent' | 'failed';
  error_message: string | null;
  sent_by_user_id: string | null;
  created_at: string;
}

export interface CustomerInvitationStats {
  totalCompanies: number;
  totalRecipients: number;
  neverInvitedRecipients: number;
  previouslyInvitedRecipients: number;
  totalInvitationsSent: number;
}

export const DeveloperCustomerInvitations: React.FC = () => {
  const { t } = useLocalization();

  // State
  const [companies, setCompanies] = useState<CustomerCompany[]>([]);
  const [stats, setStats] = useState<CustomerInvitationStats>({
    totalCompanies: 0,
    totalRecipients: 0,
    neverInvitedRecipients: 0,
    previouslyInvitedRecipients: 0,
    totalInvitationsSent: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'never_invited' | 'partially_invited' | 'all_invited'>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Modals state
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState<boolean>(false);
  const [editingCompany, setEditingCompany] = useState<CustomerCompany | null>(null);

  const [invitingCompany, setInvitingCompany] = useState<CustomerCompany | null>(null);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [confirmReinvite, setConfirmReinvite] = useState<boolean>(false);
  const [sendingInvite, setSendingInvite] = useState<boolean>(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);
  const [previewCompanyName, setPreviewCompanyName] = useState<string>('ABC Event Management');
  const [previewTemplate, setPreviewTemplate] = useState<{ subject: string; html: string; text: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [previewViewMode, setPreviewViewMode] = useState<'html' | 'text'>('html');
  const [copiedText, setCopiedText] = useState<boolean>(false);

  const [isLogsModalOpen, setIsLogsModalOpen] = useState<boolean>(false);
  const [logs, setLogs] = useState<CustomerInvitationLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

  const [deletingCompany, setDeletingCompany] = useState<CustomerCompany | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Form state for Add/Edit Company
  const [formCompanyName, setFormCompanyName] = useState<string>('');
  const [formContactPerson, setFormContactPerson] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formRecipients, setFormRecipients] = useState<Array<{ id?: string; email: string; recipient_name: string }>>([
    { email: '', recipient_name: '' },
  ]);
  const [formErrors, setFormErrors] = useState<string | null>(null);
  const [submittingForm, setSubmittingForm] = useState<boolean>(false);

  // Cross-company duplicate detection state
  const [crossCompanyMatches, setCrossCompanyMatches] = useState<Record<string, string>>({});
  const [pendingCrossCompanyWarning, setPendingCrossCompanyWarning] = useState<{
    duplicates: Array<{ email: string; company_name: string; company_id: string }>;
    targetCompanyName: string;
    validRecipients: Array<{ id?: string; email: string; recipient_name: string }>;
  } | null>(null);

  // Real-time analysis for Case 1: Duplicates inside the same company
  const sameCompanyDuplicateIndices = useMemo(() => {
    const counts = new Map<string, number[]>();
    formRecipients.forEach((r, idx) => {
      const clean = r.email.trim().toLowerCase();
      if (!clean) return;
      const arr = counts.get(clean) || [];
      arr.push(idx);
      counts.set(clean, arr);
    });

    const duplicateIndices = new Set<number>();
    const secondaryDuplicateIndices = new Set<number>();

    counts.forEach((indices) => {
      if (indices.length > 1) {
        indices.forEach((idx, pos) => {
          duplicateIndices.add(idx);
          if (pos > 0) {
            secondaryDuplicateIndices.add(idx);
          }
        });
      }
    });

    return { duplicateIndices, secondaryDuplicateIndices, hasDuplicates: duplicateIndices.size > 0 };
  }, [formRecipients]);

  // Real-time analysis for Case 2: Cross-company duplicate detection
  useEffect(() => {
    if (!isCompanyModalOpen) {
      setCrossCompanyMatches({});
      return;
    }

    // 1. Immediate local check against loaded companies
    const localMatches: Record<string, string> = {};
    const emailsToCheck: string[] = [];

    formRecipients.forEach((r) => {
      const clean = r.email.trim().toLowerCase();
      if (!clean) return;
      emailsToCheck.push(clean);

      for (const comp of companies) {
        if (editingCompany && comp.id === editingCompany.id) continue;
        const found = comp.recipients.some((cr) => cr.email.trim().toLowerCase() === clean);
        if (found) {
          localMatches[clean] = comp.company_name;
          break;
        }
      }
    });

    setCrossCompanyMatches((prev) => ({ ...prev, ...localMatches }));

    // 2. Debounced authoritative check against server endpoint
    if (emailsToCheck.length === 0) return;

    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch('/api/developer/customer-invitations/check-duplicates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emails: emailsToCheck,
            exclude_company_id: editingCompany?.id,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.duplicates)) {
            const serverMatches: Record<string, string> = { ...localMatches };
            data.duplicates.forEach((d: any) => {
              if (d.email && d.company_name) {
                serverMatches[d.email.toLowerCase()] = d.company_name;
              }
            });
            setCrossCompanyMatches(serverMatches);
          }
        }
      } catch (err) {
        // Silent failure for background check
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [formRecipients, companies, isCompanyModalOpen, editingCompany]);

  // Fetch Companies
  const fetchCompanies = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const queryParams = new URLSearchParams();
      if (searchQuery.trim()) queryParams.set('search', searchQuery.trim());
      if (statusFilter !== 'all') queryParams.set('statusFilter', statusFilter);

      const res = await apiFetch(`/api/developer/customer-invitations/companies?${queryParams.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load companies: ${res.statusText}`);
      }
      const data = await res.json();
      if (data.success) {
        setCompanies(data.companies || []);
        if (data.stats) {
          setStats(data.stats);
        }
      }
    } catch (err: any) {
      console.error('Error fetching customer companies:', err);
      setFeedback({ type: 'error', message: err?.message || 'Failed to fetch customer companies.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, [statusFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCompanies();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load email preview
  const loadEmailPreview = async (name: string) => {
    setLoadingPreview(true);
    try {
      const res = await apiFetch(`/api/developer/customer-invitations/preview-email?company_name=${encodeURIComponent(name || 'ABC Event Management')}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.template) {
          setPreviewTemplate(data.template);
        }
      }
    } catch (err) {
      console.error('Error loading email preview:', err);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Load audit logs
  const loadLogs = async () => {
    setLoadingLogs(true);
    setIsLogsModalOpen(true);
    try {
      const res = await apiFetch('/api/developer/customer-invitations/logs?limit=100');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setLogs(data.logs || []);
        }
      }
    } catch (err) {
      console.error('Error loading logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  // Open Add Company Modal
  const handleOpenAddModal = () => {
    setEditingCompany(null);
    setFormCompanyName('');
    setFormContactPerson('');
    setFormNotes('');
    setFormRecipients([{ email: '', recipient_name: '' }]);
    setFormErrors(null);
    setCrossCompanyMatches({});
    setPendingCrossCompanyWarning(null);
    setIsCompanyModalOpen(true);
  };

  // Open Edit Company Modal
  const handleOpenEditModal = (comp: CustomerCompany) => {
    setEditingCompany(comp);
    setFormCompanyName(comp.company_name);
    setFormContactPerson(comp.contact_person || '');
    setFormNotes(comp.notes || '');
    setFormRecipients(
      comp.recipients.length > 0
        ? comp.recipients.map((r) => ({
            id: r.id,
            email: r.email,
            recipient_name: r.recipient_name || '',
          }))
        : [{ email: '', recipient_name: '' }]
    );
    setFormErrors(null);
    setCrossCompanyMatches({});
    setPendingCrossCompanyWarning(null);
    setIsCompanyModalOpen(true);
  };

  // Add recipient field in form
  const handleAddRecipientField = () => {
    setFormRecipients([...formRecipients, { email: '', recipient_name: '' }]);
  };

  // Remove recipient field in form
  const handleRemoveRecipientField = (index: number) => {
    if (formRecipients.length <= 1) {
      setFormErrors('At least one recipient email address is required.');
      return;
    }
    const updated = [...formRecipients];
    updated.splice(index, 1);
    setFormRecipients(updated);
  };

  // Save company core executor (handles creation, update, and cross-company confirmation)
  const executeSaveCompany = async (confirmedCrossCompany = false) => {
    setFormErrors(null);

    const name = formCompanyName.trim();
    if (!name) {
      setFormErrors('Company name is required.');
      return;
    }

    // CASE 1: Immediate verification of same-company duplicates
    const validRecipients: Array<{ id?: string; email: string; recipient_name: string }> = [];
    const seenEmails = new Set<string>();

    for (const r of formRecipients) {
      const email = r.email.trim().toLowerCase();
      if (!email) continue;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setFormErrors(`Invalid email address: "${r.email}". Please enter a valid email.`);
        return;
      }
      if (seenEmails.has(email)) {
        setFormErrors(`Duplicate email address "${email}" within the same company. Each recipient must have a unique email.`);
        return;
      }
      seenEmails.add(email);
      validRecipients.push({
        id: r.id,
        email,
        recipient_name: r.recipient_name.trim(),
      });
    }

    if (validRecipients.length === 0) {
      setFormErrors('At least one valid recipient email address is required.');
      return;
    }

    // CASE 2: Pre-submission check for cross-company duplicate warning (if not explicitly confirmed)
    if (!confirmedCrossCompany) {
      try {
        const checkRes = await apiFetch('/api/developer/customer-invitations/check-duplicates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emails: validRecipients.map((r) => r.email),
            exclude_company_id: editingCompany?.id,
          }),
        });

        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.success && Array.isArray(checkData.duplicates) && checkData.duplicates.length > 0) {
            setPendingCrossCompanyWarning({
              duplicates: checkData.duplicates,
              targetCompanyName: name,
              validRecipients,
            });
            return;
          }
        }
      } catch (checkErr) {
        console.warn('Cross-company pre-check error:', checkErr);
      }
    }

    setSubmittingForm(true);
    try {
      if (editingCompany) {
        // Update
        const res = await apiFetch(`/api/developer/customer-invitations/companies/${editingCompany.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_name: name,
            contact_person: formContactPerson.trim() || null,
            notes: formNotes.trim() || null,
            recipients: validRecipients,
            confirm_cross_company_duplicates: confirmedCrossCompany,
          }),
        });

        const data = await res.json();

        if (data.code === 'CROSS_COMPANY_DUPLICATE_WARNING' && Array.isArray(data.cross_company_duplicates)) {
          setPendingCrossCompanyWarning({
            duplicates: data.cross_company_duplicates,
            targetCompanyName: name,
            validRecipients,
          });
          setSubmittingForm(false);
          return;
        }

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to update company.');
        }

        setFeedback({ type: 'success', message: `Company "${name}" updated successfully.` });
      } else {
        // Create
        const res = await apiFetch('/api/developer/customer-invitations/companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_name: name,
            contact_person: formContactPerson.trim() || null,
            notes: formNotes.trim() || null,
            recipients: validRecipients,
            confirm_cross_company_duplicates: confirmedCrossCompany,
          }),
        });

        const data = await res.json();

        if (data.code === 'CROSS_COMPANY_DUPLICATE_WARNING' && Array.isArray(data.cross_company_duplicates)) {
          setPendingCrossCompanyWarning({
            duplicates: data.cross_company_duplicates,
            targetCompanyName: name,
            validRecipients,
          });
          setSubmittingForm(false);
          return;
        }

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to create company.');
        }

        setFeedback({ type: 'success', message: `Company "${name}" created with ${validRecipients.length} recipients.` });
      }

      setPendingCrossCompanyWarning(null);
      setIsCompanyModalOpen(false);
      fetchCompanies();
    } catch (err: any) {
      console.error('Error saving company:', err);
      setFormErrors(err.message || 'Failed to save company.');
    } finally {
      setSubmittingForm(false);
    }
  };

  // Form submit handler
  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();

    // CASE 1: Block form save if any duplicate email exists within this company
    if (sameCompanyDuplicateIndices.hasDuplicates) {
      setFormErrors('Duplicate email. This email has already been added to this company.');
      return;
    }

    await executeSaveCompany(false);
  };

  // Open Delete Modal
  const handleOpenDeleteModal = (comp: CustomerCompany) => {
    setDeletingCompany(comp);
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deletingCompany) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/developer/customer-invitations/companies/${deletingCompany.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete company.');
      }
      setFeedback({ type: 'success', message: `Company "${deletingCompany.company_name}" deleted.` });
      setDeletingCompany(null);
      fetchCompanies();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete company.' });
    } finally {
      setDeleting(false);
    }
  };

  // Open Send Invitations Modal
  const handleOpenInviteModal = (comp: CustomerCompany) => {
    setInvitingCompany(comp);
    // Pre-select all recipients
    setSelectedRecipientIds(comp.recipients.map((r) => r.id));
    setConfirmReinvite(false);
    setInviteError(null);
  };

  // Check how many of the selected recipients were previously invited
  const previouslyInvitedSelected = useMemo(() => {
    if (!invitingCompany) return [];
    const selectedSet = new Set(selectedRecipientIds);
    return invitingCompany.recipients.filter(
      (r) => selectedSet.has(r.id) && ((r.invitation_count || 0) > 0 || (r.last_invited_at != null && r.last_invitation_status !== 'failed'))
    );
  }, [invitingCompany, selectedRecipientIds]);

  const hasPreviouslyInvitedSelected = previouslyInvitedSelected.length > 0;

  // Toggle recipient selection
  const handleToggleRecipient = (id: string) => {
    if (selectedRecipientIds.includes(id)) {
      setSelectedRecipientIds(selectedRecipientIds.filter((item) => item !== id));
    } else {
      setSelectedRecipientIds([...selectedRecipientIds, id]);
    }
  };

  const handleSelectAllRecipients = () => {
    if (!invitingCompany) return;
    if (selectedRecipientIds.length === invitingCompany.recipients.length) {
      setSelectedRecipientIds([]);
    } else {
      setSelectedRecipientIds(invitingCompany.recipients.map((r) => r.id));
    }
  };

  // Send Invitations
  const handleSendInvitations = async () => {
    if (!invitingCompany) return;
    if (selectedRecipientIds.length === 0) {
      setInviteError('Please select at least one recipient to invite.');
      return;
    }

    if (hasPreviouslyInvitedSelected && !confirmReinvite) {
      setInviteError('Please check the confirmation box to confirm sending invitations again to previously invited recipients.');
      return;
    }

    setSendingInvite(true);
    setInviteError(null);

    try {
      const res = await apiFetch(`/api/developer/customer-invitations/companies/${invitingCompany.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_ids: selectedRecipientIds,
          confirm_reinvite: confirmReinvite,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.code === 'REINVITATION_CONFIRMATION_REQUIRED') {
          setInviteError('Explicit confirmation required: One or more selected recipients have already been invited previously.');
          return;
        }
        throw new Error(data.error || 'Failed to send invitations.');
      }

      setFeedback({
        type: 'success',
        message: `Invitation email sent successfully to ${data.sent} recipient(s) belonging to "${invitingCompany.company_name}".`,
      });

      setInvitingCompany(null);
      fetchCompanies();
    } catch (err: any) {
      console.error('Error sending invitations:', err);
      setInviteError(err.message || 'Failed to send invitations.');
    } finally {
      setSendingInvite(false);
    }
  };

  // Format date helper
  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Never';
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                {t('developer.customerInvitationsTitle')}
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                  {t('developer.prospectiveB2BOutreach')}
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                {t('developer.customerInvitationsDesc')}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          <button
            onClick={() => {
              loadEmailPreview('ABC Event Management');
              setIsPreviewModalOpen(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            title={t('developer.previewCustomerEmailTemplate', undefined, 'Preview the exact email template sent to customers')}
          >
            <Eye className="w-3.5 h-3.5 text-sky-400" />
            <span>{t('developer.emailTemplate')}</span>
          </button>

          <button
            onClick={loadLogs}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            title={t('developer.viewCustomerInvitationAuditLog', undefined, 'View full audit log of all customer invitation deliveries')}
          >
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            <span>{t('developer.deliveryAuditLogs')}</span>
          </button>

          <button
            onClick={() => fetchCompanies(true)}
            disabled={refreshing}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            title={t('common.refresh', undefined, 'Refresh list')}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-amber-400' : ''}`} />
          </button>

          <button
            onClick={handleOpenAddModal}
            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t('developer.addCompany')}</span>
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs animate-in fade-in slide-in-from-top-2 duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-200'
              : feedback.type === 'error'
              ? 'bg-rose-950/60 border-rose-500/30 text-rose-200'
              : 'bg-sky-950/60 border-sky-500/30 text-sky-200'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : feedback.type === 'error' ? (
              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-sky-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>{t('developer.totalCompanies')}</span>
            <Building2 className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-white">{stats.totalCompanies}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{t('developer.companyName')}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>{t('developer.totalRecipients')}</span>
            <Users className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-xl font-bold text-white">{stats.totalRecipients}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{t('developer.recipients')}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>{t('developer.neverInvited')}</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          </div>
          <div className="text-xl font-bold text-emerald-400">{stats.neverInvitedRecipients}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{t('developer.pendingInvitation')}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>{t('developer.previouslyInvited')}</span>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-amber-400">{stats.previouslyInvitedRecipients}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{t('developer.reinvitationNotice')}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>{t('developer.totalInvitationsSent')}</span>
            <Mail className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xl font-bold text-indigo-400">{stats.totalInvitationsSent}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Resend</div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('developer.searchCompaniesPlaceholder')}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-1 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {t('developer.allStatus')} ({stats.totalCompanies})
          </button>
          <button
            onClick={() => setStatusFilter('never_invited')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === 'never_invited'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {t('developer.neverInvited')}
          </button>
          <button
            onClick={() => setStatusFilter('partially_invited')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === 'partially_invited'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {t('developer.partiallyInvited')}
          </button>
          <button
            onClick={() => setStatusFilter('all_invited')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              statusFilter === 'all_invited'
                ? 'bg-indigo-500 text-slate-950 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {t('developer.allInvited')}
          </button>
        </div>
      </div>

      {/* Companies Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400">{t('developer.loadingCustomerCompanies', undefined, 'Loading customer companies...')}</p>
          </div>
        ) : companies.length === 0 ? (
          <div className="py-16 text-center space-y-4 px-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/80 text-slate-500 flex items-center justify-center mx-auto border border-slate-700/60">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">{t('developer.noCompaniesFound', undefined, 'No customer companies found')}</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                {searchQuery || statusFilter !== 'all'
                  ? 'No companies match your current filters. Try changing your search query or reset the filter.'
                  : 'Start by adding a prospective client company with their recipient email addresses to invite them.'}
              </p>
            </div>
            {!searchQuery && statusFilter === 'all' && (
              <button
                onClick={handleOpenAddModal}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-colors inline-flex items-center space-x-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('developer.addFirstCompany', undefined, 'Add Your First Company')}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold text-[10px]">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">{t('developer.company')}</th>
                  <th className="py-3.5 px-4">{t('developer.recipients')}</th>
                  <th className="py-3.5 px-4">{t('developer.status')}</th>
                  <th className="py-3.5 px-4">{t('developer.lastInvitation')}</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">{t('developer.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {companies.map((comp) => {
                  return (
                    <tr key={comp.id} className="hover:bg-slate-800/40 transition-colors group">
                      {/* Company Name & Contact */}
                      <td className="py-4 px-4 sm:px-6">
                        <div className="space-y-1">
                          <div className="font-bold text-white text-sm flex items-center gap-2">
                            <span>{comp.company_name}</span>
                          </div>
                          {comp.contact_person && (
                            <div className="text-slate-400 text-xs flex items-center gap-1.5">
                              <span className="text-slate-500">{t('common.contact', undefined, 'Contact')}:</span>
                              <span className="text-slate-300 font-medium">{comp.contact_person}</span>
                            </div>
                          )}
                          {comp.notes && (
                            <div className="text-[11px] text-slate-400 italic line-clamp-1 max-w-xs">
                              &ldquo;{comp.notes}&rdquo;
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Recipients Breakdown */}
                      <td className="py-4 px-4">
                        <div className="space-y-1.5 max-w-xs sm:max-w-sm">
                          <div className="flex items-center space-x-2 text-[11px]">
                            <span className="font-bold text-white">{comp.totalRecipients} Recipient(s):</span>
                            {comp.neverInvitedCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-medium border border-emerald-500/20">
                                {comp.neverInvitedCount} new
                              </span>
                            )}
                            {comp.previouslyInvitedCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-medium border border-amber-500/20">
                                {comp.previouslyInvitedCount} invited
                              </span>
                            )}
                          </div>

                          {/* Recipient email chips */}
                          <div className="flex flex-wrap gap-1">
                            {comp.recipients.map((rec) => {
                              const isFailed = rec.last_invitation_status === 'failed';
                              return (
                                <span
                                  key={rec.id}
                                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono border ${
                                    isFailed
                                      ? 'bg-slate-950 text-rose-300 border-rose-500/40'
                                      : rec.invitation_count > 0
                                      ? 'bg-slate-950 text-amber-300 border-amber-500/30'
                                      : 'bg-slate-950 text-emerald-300 border-emerald-500/30'
                                  }`}
                                  title={
                                    isFailed
                                      ? `Failed: ${rec.last_invitation_error || 'Delivery error'}. Click Invite to retry.`
                                      : rec.invitation_count > 0
                                      ? `Invited ${rec.invitation_count} time(s). Last on: ${formatDate(rec.last_invited_at)}`
                                      : 'Never invited yet'
                                  }
                                >
                                  {rec.email}
                                  {isFailed ? (
                                    <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-rose-500/20 text-rose-400 font-sans font-bold">
                                      Failed
                                    </span>
                                  ) : rec.invitation_count > 0 ? (
                                    <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-400 font-sans font-bold">
                                      {rec.invitation_count}x
                                    </span>
                                  ) : null}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </td>

                      {/* Invitation Status */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        {comp.invitationStatus === 'never_invited' ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
                            Never Invited
                          </span>
                        ) : comp.invitationStatus === 'partially_invited' ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5" />
                            Partially Invited
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-indigo-400" />
                            All Invited
                          </span>
                        )}
                      </td>

                      {/* Last Invitation Date */}
                      <td className="py-4 px-4 text-slate-400 text-xs whitespace-nowrap">
                        {comp.lastInvitedAt ? (
                          <div className="space-y-0.5">
                            <div className="text-white font-medium">{formatDate(comp.lastInvitedAt)}</div>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">{t('common.never', undefined, 'Never')}</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 sm:px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* Invite CTA Button */}
                          <button
                            onClick={() => handleOpenInviteModal(comp)}
                            className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold rounded-lg text-xs transition-all shadow-md shadow-amber-500/10 cursor-pointer"
                            title={t('developer.sendInvitations', undefined, 'Send platform invitation email')}
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>{t('developer.sendInvitations', undefined, 'Invite')}</span>
                          </button>

                          {/* Edit Button */}
                          <button
                            onClick={() => handleOpenEditModal(comp)}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title={t('developer.editCompany', undefined, 'Edit company & recipients')}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {/* Delete Button */}
                          <button
                            onClick={() => handleOpenDeleteModal(comp)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                            title={t('developer.deleteCompany', undefined, 'Delete company')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* MODAL 1: SEND INVITATIONS & EXPLICIT RE-INVITATION CONFIRMATION      */}
      {/* ===================================================================== */}
      {invitingCompany && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-xs">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Send Customer Invitation</h3>
                  <p className="text-slate-400">
                    Target Company: <strong className="text-amber-400">{invitingCompany.company_name}</strong>
                    <span className="block text-slate-400 text-[11px] mt-0.5">
                      All selected recipients will receive ONE shared invitation email.
                    </span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInvitingCompany(null)}
                className="text-slate-400 hover:text-white p-1 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error banner inside modal */}
            {inviteError && (
              <div className="p-3 bg-rose-950/60 border border-rose-500/30 rounded-xl text-rose-300 flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{inviteError}</span>
              </div>
            )}

            {/* Recipients Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-slate-300 font-semibold">
                <span>Select Recipients ({selectedRecipientIds.length} of {invitingCompany.recipients.length} selected):</span>
                <button
                  type="button"
                  onClick={handleSelectAllRecipients}
                  className="text-amber-400 hover:underline text-[11px]"
                >
                  {selectedRecipientIds.length === invitingCompany.recipients.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {invitingCompany.recipients.map((rec) => {
                  const isSelected = selectedRecipientIds.includes(rec.id);
                  const isPreviouslyInvited = (rec.invitation_count || 0) > 0 && rec.last_invitation_status !== 'failed';
                  const isFailed = rec.last_invitation_status === 'failed';

                  return (
                    <label
                      key={rec.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-slate-950 border-amber-500/40 text-white'
                          : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-950'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleRecipient(rec.id)}
                          className="w-4 h-4 rounded text-amber-500 focus:ring-0 focus:ring-offset-0 bg-slate-900 border-slate-700"
                        />
                        <div>
                          <div className="font-semibold text-slate-200">{rec.email}</div>
                          {rec.recipient_name && (
                            <div className="text-[10px] text-slate-400">{rec.recipient_name}</div>
                          )}
                        </div>
                      </div>

                      <div>
                        {isFailed ? (
                          <span
                            className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[10px] font-medium"
                            title={rec.last_invitation_error || 'Delivery failed'}
                          >
                            Failed &bull; Ready to Retry
                          </span>
                        ) : isPreviouslyInvited ? (
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-medium">
                            Invited {rec.invitation_count}x
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-medium">
                            Never Invited
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* CRITICAL RE-INVITATION CONFIRMATION SECTION */}
            {hasPreviouslyInvitedSelected && (
              <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-xl space-y-3 animate-in fade-in duration-200">
                <div className="flex items-start space-x-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-amber-300 text-xs">
                      Re-Invitation Confirmation Required
                    </h4>
                    <p className="text-amber-200/80 text-[11px] leading-relaxed mt-0.5">
                      <strong>{previouslyInvitedSelected.length}</strong> of the selected recipients have already received an invitation previously:
                    </p>
                  </div>
                </div>

                <div className="bg-slate-950/80 rounded-lg p-2.5 border border-amber-500/20 max-h-28 overflow-y-auto space-y-1">
                  {previouslyInvitedSelected.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-[11px]">
                      <span className="text-amber-200 font-mono">{r.email}</span>
                      <span className="text-slate-400 text-[10px]">
                        Last sent: {formatDate(r.last_invited_at)} ({r.invitation_count} total)
                      </span>
                    </div>
                  ))}
                </div>

                {/* Explicit Confirmation Checkbox */}
                <label className="flex items-center space-x-2.5 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg cursor-pointer hover:bg-amber-500/15 transition-colors">
                  <input
                    type="checkbox"
                    checked={confirmReinvite}
                    onChange={(e) => setConfirmReinvite(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-0 focus:ring-offset-0 bg-slate-900 border-amber-400"
                  />
                  <span className="text-amber-300 font-bold text-xs select-none">
                    Yes, I explicitly confirm re-sending invitations to these previously invited recipients.
                  </span>
                </label>
              </div>
            )}

            {/* Email Preview Snippet */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-[11px]">
              <div className="text-slate-400 flex items-center justify-between">
                <span>Subject: <strong className="text-white">Invitation to Try EventGameStudio</strong></span>
                <span className="text-slate-500">Service: Dedicated Resend API</span>
              </div>
              <div className="text-slate-500">
                Sender: <span className="text-slate-300">Configured via RESEND_INVITATION_FROM (Resend)</span>
              </div>
              <div className="text-slate-500">
                Delivery: <span className="text-amber-400/90 font-medium">ONE shared email addressed to {selectedRecipientIds.length} recipient{selectedRecipientIds.length === 1 ? '' : 's'}</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setInvitingCompany(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                disabled={sendingInvite}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSendInvitations}
                disabled={sendingInvite || selectedRecipientIds.length === 0 || (hasPreviouslyInvitedSelected && !confirmReinvite)}
                className="flex items-center space-x-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {sendingInvite ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Delivering via Resend...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      Send Invitation to {selectedRecipientIds.length} Recipient{selectedRecipientIds.length === 1 ? '' : 's'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: ADD / EDIT COMPANY WITH DYNAMIC RECIPIENTS                   */}
      {/* ===================================================================== */}
      {isCompanyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <form
            onSubmit={handleSaveCompany}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-xs"
          >
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingCompany ? 'Edit Customer Company' : 'Add Prospective Customer Company'}
                  </h3>
                  <p className="text-slate-400">
                    Configure company details and multiple recipient email addresses.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCompanyModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error message */}
            {formErrors && (
              <div className="p-3 bg-rose-950/60 border border-rose-500/30 rounded-xl text-rose-300 flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{formErrors}</span>
              </div>
            )}

            {/* Company Name */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold flex items-center justify-between">
                <span>Company Name *</span>
                <span className="text-[10px] text-slate-500">Required</span>
              </label>
              <input
                type="text"
                required
                value={formCompanyName}
                onChange={(e) => setFormCompanyName(e.target.value)}
                placeholder="e.g. ABC Event Management Ltd"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Contact Person Name & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold">Contact Person (Optional)</label>
                <input
                  type="text"
                  value={formContactPerson}
                  onChange={(e) => setFormContactPerson(e.target.value)}
                  placeholder="e.g. Sarah Tan"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold">Notes / Industry</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g. Event agency, corporate roadshows"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Recipient Email Addresses (Dynamic multi-recipient list) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                  <span>Recipient Email Addresses * (At least 1 required)</span>
                </label>
                <button
                  type="button"
                  onClick={handleAddRecipientField}
                  className="flex items-center space-x-1 text-amber-400 hover:text-amber-300 font-semibold text-[11px] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('developer.addRecipient', undefined, 'Add Recipient')}</span>
                </button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {formRecipients.map((rec, idx) => {
                  const cleanEmail = rec.email.trim().toLowerCase();
                  const isDuplicateInCompany = sameCompanyDuplicateIndices.duplicateIndices.has(idx);
                  const isSecondaryDuplicate = sameCompanyDuplicateIndices.secondaryDuplicateIndices.has(idx);
                  const crossCompanyMatch = cleanEmail && !isDuplicateInCompany ? crossCompanyMatches[cleanEmail] : null;

                  return (
                    <div
                      key={idx}
                      className={`p-2 rounded-xl border transition-all ${
                        isDuplicateInCompany
                          ? 'bg-rose-950/20 border-rose-500/60'
                          : crossCompanyMatch
                          ? 'bg-amber-950/15 border-amber-500/50'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex-1 space-y-1">
                          <input
                            type="email"
                            required
                            value={rec.email}
                            onChange={(e) => {
                              const updated = [...formRecipients];
                              updated[idx].email = e.target.value;
                              setFormRecipients(updated);
                            }}
                            placeholder={t('developer.recipientEmailPlaceholder', undefined, 'recipient@example.com')}
                            className={`w-full px-2.5 py-1.5 bg-slate-900 border rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none font-mono transition-colors ${
                              isDuplicateInCompany
                                ? 'border-rose-500 focus:border-rose-400 focus:ring-1 focus:ring-rose-500/30 text-rose-200'
                                : crossCompanyMatch
                                ? 'border-amber-500 focus:border-amber-400 focus:ring-1 focus:ring-amber-500/30'
                                : 'border-slate-700 focus:border-amber-500'
                            }`}
                          />
                        </div>
                        <div className="w-36">
                          <input
                            type="text"
                            value={rec.recipient_name}
                            onChange={(e) => {
                              const updated = [...formRecipients];
                              updated[idx].recipient_name = e.target.value;
                              setFormRecipients(updated);
                            }}
                            placeholder={t('developer.recipientNamePlaceholder', undefined, 'Name (optional)')}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        {formRecipients.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveRecipientField(idx)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                            title={t('developer.removeRecipient', undefined, 'Remove recipient')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* CASE 1: Inline Error for Duplicate within same company */}
                      {isDuplicateInCompany && (
                        <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 bg-rose-500/15 border border-rose-500/30 rounded-lg text-[11px] text-rose-300 font-medium animate-in fade-in duration-150">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span>
                            {isSecondaryDuplicate
                              ? 'Duplicate email. This email has already been added to this company.'
                              : 'Duplicate email detected for this recipient address.'}
                          </span>
                        </div>
                      )}

                      {/* CASE 2: Inline Warning for Email already under another company */}
                      {crossCompanyMatch && !isDuplicateInCompany && (
                        <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 bg-amber-500/15 border border-amber-500/30 rounded-lg text-[11px] text-amber-300 font-medium animate-in fade-in duration-150">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>
                            ⚠ This email is already associated with another company: <strong className="text-amber-200 underline font-semibold">{crossCompanyMatch}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-500">
                All recipients added here belong to this company. When inviting, you can send to all or select individual recipients.
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsCompanyModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                disabled={submittingForm}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={submittingForm}
                className="flex items-center space-x-2 px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
              >
                {submittingForm ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('common.saving', undefined, 'Saving...')}</span>
                  </>
                ) : (
                  <span>{editingCompany ? 'Save Changes' : 'Create Company'}</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2B: CROSS-COMPANY DUPLICATE WARNING CONFIRMATION MODAL         */}
      {/* ===================================================================== */}
      {pendingCrossCompanyWarning && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-amber-500/50 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-start space-x-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                  <span>Email Already Associated With Another Company</span>
                </h3>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  Notice: One or more recipient email addresses are already associated with an existing customer company.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-slate-300 font-medium">
                ⚠ {pendingCrossCompanyWarning.duplicates.length === 1
                  ? 'This email is already associated with another company:'
                  : 'These emails are already associated with another company:'}
              </div>

              <div className="bg-slate-950/90 rounded-xl p-3 border border-amber-500/30 max-h-40 overflow-y-auto space-y-2.5">
                {pendingCrossCompanyWarning.duplicates.map((dup, dIdx) => (
                  <div key={dIdx} className="space-y-0.5 border-b border-slate-800/80 last:border-0 pb-2 last:pb-0">
                    <div className="font-mono font-bold text-amber-300 text-xs">
                      {dup.email}
                    </div>
                    <div className="text-slate-400 text-[11px] flex items-center gap-1">
                      <span className="text-slate-500">Existing company:</span>
                      <strong className="text-white font-semibold">{dup.company_name}</strong>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-slate-300 text-xs leading-relaxed pt-1">
                Do you want to continue adding {pendingCrossCompanyWarning.duplicates.length === 1 ? 'this email' : 'these emails'} to <strong className="text-white font-semibold">{pendingCrossCompanyWarning.targetCompanyName}</strong>?
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPendingCrossCompanyWarning(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => executeSaveCompany(true)}
                className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                Yes, Continue and Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: EMAIL TEMPLATE PREVIEW                                       */}
      {/* ===================================================================== */}
      {isPreviewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Email Invitation Template Preview</h3>
                  <p className="text-slate-400">
                    Live preview of the invitation email dispatched to prospective clients via Resend.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPreviewModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Test Company Name Input */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-400 text-xs font-semibold whitespace-nowrap">
                Preview Company Name:
              </span>
              <input
                type="text"
                value={previewCompanyName}
                onChange={(e) => {
                  setPreviewCompanyName(e.target.value);
                  loadEmailPreview(e.target.value);
                }}
                placeholder={t('developer.enterSampleCompanyName', undefined, 'Enter sample company name...')}
                className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
              <div className="flex items-center space-x-1 border-l border-slate-800 pl-2">
                <button
                  type="button"
                  onClick={() => setPreviewViewMode('html')}
                  className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                    previewViewMode === 'html' ? 'bg-sky-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  HTML
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewViewMode('text')}
                  className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                    previewViewMode === 'text' ? 'bg-sky-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Plain Text
                </button>
              </div>
            </div>

            {/* Email Metadata */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 font-mono text-[11px]">
              <div>
                <span className="text-slate-500">Subject: </span>
                <span className="text-white font-semibold">Invitation to Try EventGameStudio</span>
              </div>
              <div>
                <span className="text-slate-500">From: </span>
                <span className="text-amber-400">Mun Jian &lt;eventgamestudio@gmail.com&gt;</span>
              </div>
              <div>
                <span className="text-slate-500">Delivery Service: </span>
                <span className="text-emerald-400">Resend REST API (https://api.resend.com/emails)</span>
              </div>
            </div>

            {/* Preview Box */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
              {loadingPreview ? (
                <div className="py-16 text-center">
                  <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-[11px] text-slate-400 mt-2">Rendering preview...</p>
                </div>
              ) : previewViewMode === 'html' ? (
                <iframe
                  title={t('developer.emailHtmlPreview', undefined, 'Email HTML Preview')}
                  srcDoc={previewTemplate?.html || ''}
                  className="w-full h-80 border-0 bg-slate-950"
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="p-4 font-mono text-xs whitespace-pre-wrap text-slate-300 leading-relaxed">
                  {previewTemplate?.text}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              {previewViewMode === 'text' && previewTemplate?.text ? (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(previewTemplate.text);
                    setCopiedText(true);
                    setTimeout(() => setCopiedText(false), 2000);
                  }}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs cursor-pointer transition-colors"
                >
                  {copiedText ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">{t('developer.copiedToClipboard', undefined, 'Copied to Clipboard!')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>{t('developer.copyPlainText', undefined, 'Copy Plain Text')}</span>
                    </>
                  )}
                </button>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: INVITATION AUDIT LOGS                                        */}
      {/* ===================================================================== */}
      {isLogsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Customer Invitation Audit Logs</h3>
                  <p className="text-slate-400">
                    Complete historical log of customer invitation emails dispatched through Resend.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsLogsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Table */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
              {loadingLogs ? (
                <div className="py-16 text-center space-y-2">
                  <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-slate-400 text-xs">{t('developer.loadingLogs', undefined, 'Loading logs...')}</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  No invitation logs recorded yet. Send your first invitation to see audit records.
                </div>
              ) : (
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase text-[9px] font-semibold tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Date / Time</th>
                      <th className="py-2.5 px-3">Recipient Email</th>
                      <th className="py-2.5 px-3">Provider</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-900/60">
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-400">
                          {formatDate(log.created_at)}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-white">
                          {log.email}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 uppercase text-[10px]">
                          {log.provider}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {log.status === 'sent' ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-sans font-bold">
                              Delivered
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-sans font-bold">
                              Failed
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-[10px] text-slate-400 truncate max-w-xs font-sans">
                          {log.provider_message_id && (
                            <span className="text-slate-500 font-mono text-[9px] block">
                              ID: {log.provider_message_id}
                            </span>
                          )}
                          {log.error_message && (
                            <span className="text-rose-400">{log.error_message}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsLogsModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Close Logs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 5: DELETE COMPANY CONFIRMATION                                  */}
      {/* ===================================================================== */}
      {deletingCompany && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">{t('developer.deleteCustomerCompanyModalTitle', undefined, 'Delete Customer Company?')}</h3>
              <p className="text-slate-400">
                Are you sure you want to delete <strong className="text-white">&ldquo;{deletingCompany.company_name}&rdquo;</strong> and its{' '}
                <strong className="text-white">{deletingCompany.recipients.length}</strong> recipient(s)? This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeletingCompany(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                disabled={deleting}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex items-center space-x-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('common.deleting', undefined, 'Deleting...')}</span>
                  </>
                ) : (
                  <span>{t('developer.deleteCompany', undefined, 'Delete Company')}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
