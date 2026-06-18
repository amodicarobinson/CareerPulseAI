import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User as FirebaseUser,
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Briefcase, 
  LayoutDashboard, 
  User as UserIcon, 
  LogOut, 
  Search, 
  FileText, 
  Plus,
  Rocket,
  ArrowRight,
  Loader2,
  Sparkles,
  RefreshCcw,
  CheckCircle2,
  Activity,
  PlusCircle,
  MapPin,
  ExternalLink,
  Users,
  X,
  Upload,
  File,
  Trash2,
  Zap,
  AlertCircle,
  Shield,
  Edit2,
  Menu,
  Linkedin,
  Sun,
  Moon,
  HelpCircle
} from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { cn, formatDate } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { analyzeResume, findJobs, generateCoverLetter, tailorResume, verifyJobStatus } from './services/gemini';
import { JobCard } from './components/JobCard';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'all-jobs' | 'profile' | 'applications' | 'autopilot' | 'how-to' | 'custom-cover-letter'>('dashboard');
  
  // States for custom cover letter generator for jobs not listed in the app
  const [customJobTitle, setCustomJobTitle] = useState('');
  const [customCompany, setCustomCompany] = useState('');
  const [customLocation, setCustomLocation] = useState('Remote');
  const [customDescription, setCustomDescription] = useState('');
  const [customJobUrl, setCustomJobUrl] = useState('');
  const [customSalary, setCustomSalary] = useState('');
  const [customJobType, setCustomJobType] = useState('Full-time');
  const [customCoverLetter, setCustomCoverLetter] = useState<string | null>(null);
  const [isGeneratingCustom, setIsGeneratingCustom] = useState(false);
  const [customStatus, setCustomStatus] = useState('applied');
  const [customSaveSuccess, setCustomSaveSuccess] = useState(false);
  const [isCustomCopied, setIsCustomCopied] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [autoPilotStatus, setAutoPilotStatus] = useState<boolean>(false);
  const [currentCoverLetter, setCurrentCoverLetter] = useState<string | null>(null);
  const [currentSubmission, setCurrentSubmission] = useState<any | null>(null);
  const [isPreparingSubmission, setIsPreparingSubmission] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [references, setReferences] = useState<any[]>([]);
  const [quotaHit, setQuotaHit] = useState<boolean>(false);
  const [autoPilotConfirmJob, setAutoPilotConfirmJob] = useState<{job: any, jobId: string} | null>(null);

  // Keep track of verified jobs in this session to avoid infinite loops
  const verifiedJobIdsThisSession = useRef<Set<string>>(new Set());

  // Automatic Background Verification
  useEffect(() => {
    if (!user || jobs.length === 0) return;

    const performJobVerification = async () => {
      const now = new Date();
      // Only verify jobs in matched state
      const jobsToVerify = jobs.filter(j => j.status === 'matched');
      
      let verifiedCount = 0;
      const MAX_VERIFICATIONS_PER_SESSION = 10; // Cap background work

      for (const job of jobsToVerify) {
        if (verifiedJobIdsThisSession.current.has(job.id)) continue;
        if (verifiedCount >= MAX_VERIFICATIONS_PER_SESSION) break;

        let needsVerification = false;
        if (!job.lastVerifiedAt) {
          needsVerification = true;
        } else {
          const lastVerified = new Date(job.lastVerifiedAt);
          const diffHours = (now.getTime() - lastVerified.getTime()) / (1000 * 60 * 60);
          if (diffHours >= 48) needsVerification = true; // Increased from 24 to 48 hours for efficiency
        }
        
        if (needsVerification) {
          verifiedJobIdsThisSession.current.add(job.id);
          verifiedCount++;
          try {
            // Add a substantial delay between background requests to stay under rate limits
            await new Promise(resolve => setTimeout(resolve, 10000 + Math.random() * 5000));
            const isOpen = await verifyJobStatus(job);
            
            if (!isOpen) {
              const path = `users/${user.uid}/jobs/${job.id}`;
              try {
                await deleteDoc(doc(db, 'users', user.uid, 'jobs', job.id));
              } catch (err) {
                handleFirestoreError(err, OperationType.DELETE, path);
              }
              console.log(`Job deleted: ${job.title} at ${job.company}`);
            } else {
              const path = `users/${user.uid}/jobs/${job.id}`;
              try {
                await updateDoc(doc(db, 'users', user.uid, 'jobs', job.id), {
                  lastVerifiedAt: new Date().toISOString()
                });
              } catch (err) {
                handleFirestoreError(err, OperationType.UPDATE, path);
              }
              console.log(`Job verified active: ${job.title} at ${job.company}`);
            }
          } catch (e: any) {
             console.error("Verification error", e);
             // If we hit a rate limit error even after retries, abort the loop for this session
             const isRateLimit = e?.message?.includes("429") || e?.message?.includes("quota") || e?.error?.code === 429 || e?.error?.status === "RESOURCE_EXHAUSTED" || e?.status === "RESOURCE_EXHAUSTED";
             if (isRateLimit) {
               console.warn("Aborting background verification due to rate limits.");
               setQuotaHit(true);
               break;
             }
          }
        }
      }
    };
    
    // Start verification after a delay to allow the app to boot
    const timer = setTimeout(() => {
      performJobVerification();
    }, 5000);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, user]);
  const [isEditingSearchCriteria, setIsEditingSearchCriteria] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [applyConfirmJobId, setApplyConfirmJobId] = useState<string | null>(null);
  const [isValidatingUrl, setIsValidatingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [companySizeFilter, setCompanySizeFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('Active');
  const [excludeGov, setExcludeGov] = useState<boolean>(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAutoPilotTesting, setIsAutoPilotTesting] = useState(false);
  const [autoPilotStep, setAutoPilotStep] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      return saved === 'dark' || (!saved && window.matchMedia('(pre-screen: dark)').matches);
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);
  
  const formatLogTime = (ts: any) => {
    if (!ts) return 'Stream...';
    try {
      const date = ts?.toDate ? ts.toDate() : new Date(ts);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
       return '--:--';
    }
  };

  const [editingRefIndex, setEditingRefIndex] = useState<number | null>(null);
  const [refFormData, setRefFormData] = useState({
    name: '',
    relationship: '',
    company: '',
    email: '',
    phone: ''
  });
  const [searchCriteria, setSearchCriteria] = useState<{
    roles: string;
    locations: string;
    industries: string;
    minSalary: string;
    companySize: string;
    technologies: string;
    jobType: string;
    excludeGov: boolean;
    emailNotificationsEnabled?: boolean;
  }>({
    roles: '',
    locations: '',
    industries: '',
    minSalary: '',
    companySize: '',
    technologies: '',
    jobType: '',
    excludeGov: true,
    emailNotificationsEnabled: false
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-refresh logic
  useEffect(() => {
    if (!user || !profile || loading) return;

    // Trigger initial sync on load if not done recently
    if (!lastSyncedAt) {
      handleDailySync();
    }

    const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
    const intervalId = setInterval(() => {
      console.log("Auto-refreshing jobs...");
      handleDailySync();
    }, INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [user?.uid, profile?.uid, loading]); // Minimal dependencies to prevent excessive resets

  // Derived Metrics
  const metrics = {
    appliedToday: jobs.filter(j => 
      ['applied', 'interviewing', 'offered'].includes(j.status) && 
      j.appliedAt?.startsWith(new Date().toISOString().split('T')[0])
    ).length,
    interviews: jobs.filter(j => j.status === 'interviewing' || j.status === 'offered').length,
    totalApplied: jobs.filter(j => ['applied', 'interviewing', 'offered', 'rejected'].includes(j.status)).length,
    successRate: "0"
  };
  
  if (metrics.totalApplied > 0) {
    metrics.successRate = ((metrics.interviews / metrics.totalApplied) * 100).toFixed(1);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Fetch profile
        const profileDoc = await getDoc(doc(db, 'users', user.uid));
        if (profileDoc.exists()) {
          const data = profileDoc.data();
          setProfile(data);
          setResumeText(data.resumeText || '');
          setLinkedinUrl(data.linkedinUrl || '');
          setReferences(data.references || []);
          setAutoPilotStatus(data.preferences?.autoPilotEnabled || false);
        } else {
          // Initialize empty profile
          const initialProfile = {
            uid: user.uid,
            fullName: user.displayName || 'Job Seeker',
            email: user.email || '',
            linkedinUrl: '',
            createdAt: new Date().toISOString(),
            skills: [],
            preferences: { 
              roles: [], 
              locations: ['Colorado Springs, CO', 'Remote'], 
              minSalary: 0,
              locationType: 'Hybrid in CO / Remote elsewhere',
              excludeGov: true,
              emailNotificationsEnabled: false
            }
          };
          await setDoc(doc(db, 'users', user.uid), initialProfile);
          setProfile(initialProfile);
        }

        // Listen for jobs
        const q = query(collection(db, 'users', user.uid, 'jobs'), orderBy('createdAt', 'desc'));
        const unsubJobs = onSnapshot(q, (snapshot) => {
          setJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        const logsQuery = query(collection(db, 'users', user.uid, 'autopilot_logs'), orderBy('timestamp', 'desc'));
        const unsubLogs = onSnapshot(logsQuery, (snapshot) => {
          setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).slice(0, 100));
        });

        setLoading(false);
        return () => {
          unsubJobs();
          unsubLogs();
        };
      } else {
        setProfile(null);
        setJobs([]);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingFile(true);
    try {
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
        GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs`;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await getDocument({ data: arrayBuffer }).promise;
        let fullText = "";
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map((item: any) => item.str);
          fullText += strings.join(" ") + "\n";
        }
        setResumeText(fullText.trim());
      } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        const text = await file.text();
        setResumeText(text);
      } else {
        alert("Please upload a PDF or TXT file.");
      }
    } catch (error) {
      console.error("File processing failed:", error);
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (profile?.preferences) {
      setSearchCriteria({
        roles: (profile.preferences.roles || []).join(', '),
        locations: (profile.preferences.locations || []).join(', '),
        industries: (profile.preferences.industries || []).join(', '),
        minSalary: profile.preferences.minSalary?.toString() || '',
        companySize: profile.preferences.companySize || '',
        technologies: (profile.preferences.technologies || []).join(', '),
        jobType: profile.preferences.jobType || '',
        excludeGov: profile.preferences.excludeGov || false,
        emailNotificationsEnabled: profile.preferences.emailNotificationsEnabled || false
      });
    }
  }, [profile]);

  const handleSaveSearchCriteria = async () => {
    if (!user || !profile) return;
    try {
      const updatedProfile = {
        ...profile,
        preferences: {
          ...profile.preferences,
          roles: searchCriteria.roles.split(',').map(s => s.trim()).filter(Boolean),
          locations: searchCriteria.locations.split(',').map(s => s.trim()).filter(Boolean),
          industries: searchCriteria.industries.split(',').map(s => s.trim()).filter(Boolean),
          minSalary: searchCriteria.minSalary ? parseFloat(searchCriteria.minSalary) : null,
          companySize: searchCriteria.companySize,
          technologies: searchCriteria.technologies.split(',').map(s => s.trim()).filter(Boolean),
          jobType: searchCriteria.jobType,
          excludeGov: searchCriteria.excludeGov,
          emailNotificationsEnabled: searchCriteria.emailNotificationsEnabled
        }
      };
      await updateDoc(doc(db, 'users', user.uid), updatedProfile);
      setProfile(updatedProfile);
      setIsEditingSearchCriteria(false);
      
      // Auto-trigger job search after criteria update
      await handleDailySync(updatedProfile);
    } catch (error) {
      console.error("Failed to save search criteria:", error);
    }
  };

  const handleUpdateProfile = async () => {
    if (!user || !resumeText) return;
    setIsUpdatingProfile(true);
    const path = `users/${user.uid}`;
    try {
      const analysis = await analyzeResume(resumeText);
      const updatedProfile = {
        ...profile,
        resumeText,
        linkedinUrl,
        skills: analysis.skills,
        summary: analysis.summary,
        preferences: {
          ...profile.preferences,
          roles: analysis.roles
        }
      };
      await updateDoc(doc(db, 'users', user.uid), updatedProfile);
      setProfile(updatedProfile);
      
      // Auto-trigger job search after profile update with the latest analysis
      await handleDailySync(updatedProfile);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleAutoPilot = useCallback(async (job: any, jobId: string, isManualTest: boolean = false) => {
      if (!user || !profile) return;
      
      if (isManualTest) {
        setIsAutoPilotTesting(true);
        setAutoPilotStep("Initializing Autonomous Engine...");
      }

      const logActivity = async (action: string, details: string, status: 'success' | 'error' | 'info' = 'info') => {
        try {
          await addDoc(collection(db, 'users', user.uid, 'autopilot_logs'), {
            jobId,
            jobTitle: job.title,
            company: job.company,
            action,
            details,
            status,
            timestamp: serverTimestamp()
          });
        } catch (e) {
          console.error("Failed to log activity:", e);
        }
      };

      try {
        await logActivity("Preparation Started", `Initializing autonomous workflow for ${job.title} at ${job.company}.`, 'info');
        
        if (isManualTest) setAutoPilotStep("AI: Analyzing Job and Tailoring Resume...");
        
        const [cl, tailoredResume] = await Promise.all([
          generateCoverLetter(profile.resumeText || '', job),
          tailorResume(profile.resumeText || '', job)
        ]);
 
        if (isManualTest) setAutoPilotStep("AI: Finalizing optimized assets...");
        await logActivity("AI Preparation Complete", "Tailored cover letter and resume analysis successfully generated by Gemini 1.5 Flash.", 'success');

        const appliedAt = new Date().toISOString();
        await updateDoc(doc(db, 'users', user.uid, 'jobs', jobId), {
          status: 'preparing', // Auto-prepared
          lastAction: 'auto_pilot_preparation',
          preparedAt: appliedAt,
          isAutoPilot: true,
          coverLetter: cl,
          tailoredResume: tailoredResume
        });
 
        await logActivity("System Update", "Record updated with prepared assets and marked as AutoPilot ready.", 'success');

        if (user.email && profile?.preferences?.emailNotificationsEnabled) {
           if (isManualTest) setAutoPilotStep("Dispatching System Notification...");
           fetch('/api/notify-application', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
               email: user.email,
               jobTitle: job.title,
               company: job.company,
               appliedAt,
               isAutoPilot: true
             })
           }).then(() => {
              logActivity("Notification Sent", "Email alert dispatched to the primary account address.", 'success');
           }).catch(err => {
              console.error("AutoPilot Email failed:", err);
              logActivity("Notification Failed", "Operational alert: Could not send notification email, though records were saved.", 'error');
           });
        }
      } catch (error) {
        console.error("AutoPilot flow failed:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown internal error occurred.";
        await logActivity("AutoPilot Fault", `Critical interruption: ${errorMessage}`, 'error');
      } finally {
        if (isManualTest) {
          setIsAutoPilotTesting(false);
          setAutoPilotStep(null);
        }
      }
   }, [user, profile]);

  const handleDailySync = useCallback(async (profileOverride?: any) => {
    const activeProfile = profileOverride || profile;
    if (!user || !activeProfile) return;
    setIsSearching(true);
    const path = `users/${user.uid}/jobs`;
    try {
      const newJobs = await findJobs(activeProfile);
      const jobsCol = collection(db, 'users', user.uid, 'jobs');
      
      for (const job of newJobs) {
        const exists = jobs.some(j => j.title === job.title && j.company === job.company);
        if (!exists) {
          try {
            const docRef = await addDoc(jobsCol, {
              ...job,
              userUid: user.uid,
              createdAt: new Date().toISOString(),
              status: 'matched'
            });

            // Trigger Auto-Pilot confirm if enabled and match is strong (>95)
            if (activeProfile.preferences?.autoPilotEnabled && job.matchScore >= 95) {
                // Add a staggered delay to avoid rapid-fire UI blocks
                setTimeout(() => {
                  setAutoPilotConfirmJob({ job, jobId: docRef.id });
                }, 2000);
            }
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, path);
          }
        }
      }
    } catch (error: any) {
      console.error("Sync failed:", error);
      const isRateLimit = error?.message?.includes("429") || error?.message?.includes("quota") || error?.error?.code === 429 || error?.error?.status === "RESOURCE_EXHAUSTED" || error?.status === "RESOURCE_EXHAUSTED";
      if (isRateLimit) {
        setQuotaHit(true);
      }
    } finally {
      setIsSearching(false);
      setLastSyncedAt(new Date());
    }
  }, [user, profile, jobs, handleAutoPilot]);

  useEffect(() => {
    if (!user || !profile) return;
    
    const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes
    
    const intervalId = setInterval(() => {
      console.log("Auto-refreshing job list...");
      handleDailySync();
    }, REFRESH_INTERVAL);
    
    return () => clearInterval(intervalId);
  }, [user, profile?.id, handleDailySync]);

  const handleApply = async (id: string) => {
    if (!user) return;
    const job = jobs.find(j => j.id === id);
    if (!job) return;

    setIsPreparingSubmission(true);
    setIsValidatingUrl(true);
    setUrlError(null);

    try {
      // 1. Validate URL via backend
      const valResponse = await fetch('/api/validate-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: job.url })
      });
      const valResult = await valResponse.json();

      if (!valResult.valid) {
        setUrlError((valResult.error || "This job link is broken.") + " Removing this 'dud' posting from your list.");
        // Delete the dud job from Firestore
        await deleteDoc(doc(db, 'users', user.uid, 'jobs', id));
        
        // Give the user a moment to see the message before closing
        setTimeout(() => {
          setIsPreparingSubmission(false);
          setIsValidatingUrl(false);
          setApplyConfirmJobId(null);
          setUrlError(null);
        }, 3000);
        return;
      }

      setIsValidatingUrl(false);
      
      let cl = job.coverLetter;
      let tailoredResume = job.tailoredResume;

      // Only generate if they don't already exist (e.g. not AutoPiloted)
      if (!cl || !tailoredResume) {
        const [generatedCl, generatedResume] = await Promise.all([
          generateCoverLetter(profile.resumeText || '', job),
          tailorResume(profile.resumeText || '', job)
        ]);
        cl = generatedCl;
        tailoredResume = generatedResume;
      }

      setCurrentSubmission({
        job,
        coverLetter: cl,
        tailoredResume: tailoredResume
      });

      // 2. Mark as processing
      if (job.status !== 'preparing') {
        await updateDoc(doc(db, 'users', user.uid, 'jobs', id), {
          status: 'preparing',
          preparedAt: new Date().toISOString()
        });
      }
      
      setApplyConfirmJobId(null);
    } catch (error) {
      console.error("Submission prep failed:", error);
    } finally {
      setIsPreparingSubmission(false);
      setIsValidatingUrl(false);
    }
  };

  const handleConfirmSubmission = async (id: string) => {
    if (!user) return;
    const path = `users/${user.uid}/jobs/${id}`;
    try {
      const job = jobs.find(j => j.id === id);
      const appliedAt = new Date().toISOString();

      await updateDoc(doc(db, 'users', user.uid, 'jobs', id), {
        status: 'applied',
        lastAction: 'submitted_via_ai',
        appliedAt
      });

      // Send Email Notification via Backend
      if (user.email && job && profile?.preferences?.emailNotificationsEnabled) {
        fetch('/api/notify-application', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            jobTitle: job.title,
            company: job.company,
            appliedAt
          })
        }).catch(err => console.error("Email notification failed:", err));
      }

      setCurrentSubmission(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }

    const job = jobs.find(j => j.id === id);
    if (job?.url) {
       try { window.open(job.url, '_blank'); } catch(e) {}
    }
  };

  const handleGenerateCustomCoverLetter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    if (!customJobTitle || !customCompany || !customDescription) return;

    setIsGeneratingCustom(true);
    setCustomCoverLetter(null);
    setCustomSaveSuccess(false);

    try {
      const generatedLetter = await generateCoverLetter(profile.resumeText || resumeText || '', {
        title: customJobTitle,
        company: customCompany,
        location: customLocation || 'Remote',
        description: customDescription,
        url: customJobUrl || '',
        salary: customSalary || 'Not Specified',
        jobType: customJobType || 'Full-time'
      });
      setCustomCoverLetter(generatedLetter);
    } catch (error: any) {
      console.error("Failed to generate custom cover letter:", error);
    } finally {
      setIsGeneratingCustom(false);
    }
  };

  const handleSaveCustomToPipeline = async () => {
    if (!user) return;
    const path = `users/${user.uid}/jobs`;
    try {
      const jobsCol = collection(db, 'users', user.uid, 'jobs');
      await addDoc(jobsCol, {
        title: customJobTitle,
        company: customCompany,
        location: customLocation || 'Remote',
        description: customDescription,
        fullDescription: customDescription,
        url: customJobUrl || '',
        salary: customSalary || 'Not Specified',
        jobType: customJobType || 'Full-time',
        coverLetter: customCoverLetter || '',
        status: customStatus,
        appliedAt: customStatus === 'applied' ? new Date().toISOString() : null,
        preparedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        matchScore: 100,
        matchReason: "Custom cover letter generated specifically for this manual job addition.",
        userUid: user.uid
      });
      setCustomSaveSuccess(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const handleUpdateJobStatus = async (id: string, status: string) => {
    if (!user) return;
    const path = `users/${user.uid}/jobs/${id}`;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'jobs', id), {
        status,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };


  const handleToggleEmailNotifications = async () => {
    if (!user || !profile) return;
    try {
      const nextStatus = !profile.preferences?.emailNotificationsEnabled;
      const updatedProfile = {
        ...profile,
        preferences: {
          ...profile.preferences,
          emailNotificationsEnabled: nextStatus
        }
      };
      await updateDoc(doc(db, 'users', user.uid), updatedProfile);
      setProfile(updatedProfile);
      setSearchCriteria(s => ({ ...s, emailNotificationsEnabled: nextStatus }));
    } catch (error) {
      console.error("Failed to toggle email notifications:", error);
    }
  };

  const handleToggleAutoPilot = async () => {
     if (!user || !profile) return;
     try {
       const nextStatus = !autoPilotStatus;
       const updatedProfile = {
         ...profile,
         preferences: {
           ...profile.preferences,
           autoPilotEnabled: nextStatus
         }
       };
       await updateDoc(doc(db, 'users', user.uid), updatedProfile);
       setProfile(updatedProfile);
       setAutoPilotStatus(nextStatus);
     } catch (error) {
       console.error("Failed to toggle auto-pilot:", error);
     }
  };

  const handleAddReference = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    
    const newRef = { ...refFormData };

    if (!newRef.name || !newRef.relationship) return;

    let updatedReferences;
    if (editingRefIndex !== null) {
      updatedReferences = [...references];
      updatedReferences[editingRefIndex] = newRef;
    } else {
      updatedReferences = [...references, newRef];
    }
    
    setReferences(updatedReferences);
    setEditingRefIndex(null);
    setRefFormData({ name: '', relationship: '', company: '', email: '', phone: '' });
    
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        references: updatedReferences
      });
    } catch (error) {
      console.error("Failed to save reference:", error);
    }
  };

  const handleEditReference = (index: number) => {
    const ref = references[index];
    setRefFormData({
      name: ref.name || '',
      relationship: ref.relationship || '',
      company: ref.company || '',
      email: ref.email || '',
      phone: ref.phone || ''
    });
    setEditingRefIndex(index);
    // Scroll to form or just focus? For now just set state.
  };

  const handleDeleteReference = async (index: number) => {
    if (!user) return;
    const updatedReferences = references.filter((_, i) => i !== index);
    setReferences(updatedReferences);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        references: updatedReferences
      });
    } catch (error) {
      console.error("Failed to delete reference:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 overflow-hidden">
        {/* Hero Section */}
        <div className="relative pt-20 pb-16 px-6 lg:px-8">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full overflow-hidden pointer-events-none opacity-20">
             <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-400 blur-[120px] rounded-full" />
             <div className="absolute top-[20%] right-[-10%] w-[35%] h-[35%] bg-indigo-400 blur-[120px] rounded-full" />
          </div>

          <div className="max-w-4xl mx-auto text-center relative">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold uppercase tracking-widest mb-8"
            >
              <Sparkles size={14} />
              AI-Powered Job Automation
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-6xl md:text-7xl font-extrabold text-slate-900 tracking-tight leading-[1.1]"
            >
              Apply to jobs while <br />
              <span className="text-blue-600 italic">you sleep.</span>
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mt-8 text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed"
            >
              CareerPulse AI tracks your dream roles, finds matches daily, and prepares your applications. Your career assistant is now active 24/7.
            </motion.p>
            
            <motion.div 
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.6 }}
               className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <button
                onClick={handleLogin}
                className="group relative px-8 py-4 bg-slate-900 text-white rounded-full font-bold text-lg flex items-center gap-3 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
              >
                Connect with Google
                <ArrowRight className="group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-3 gap-8 py-16">
           <div className="p-8 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-3xl shadow-sm">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
                <Search size={24} />
              </div>
              <h3 className="text-xl font-bold mb-3 text-[var(--text-primary)]">Daily Exploration</h3>
              <p className="text-[var(--text-secondary)]">Every morning we scan 100+ job boards to find roles that actually match your skill set.</p>
           </div>
           <div className="p-8 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-3xl shadow-sm">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-6">
                <FileText size={24} />
              </div>
              <h3 className="text-xl font-bold mb-3 text-[var(--text-primary)]">Custom Covers</h3>
              <p className="text-[var(--text-secondary)]">Tailored cover letters generated for every role using your specific career history.</p>
           </div>
           <div className="p-8 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-3xl shadow-sm">
              <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center mb-6">
                <Rocket size={24} />
              </div>
              <h3 className="text-xl font-bold mb-3 text-[var(--text-primary)]">Apply Fast</h3>
              <p className="text-[var(--text-secondary)]">Speed is everything. Get notified the second a new match hits the dashboard.</p>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 z-40 md:hidden" 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "w-[240px] bg-[var(--sidebar-bg)] text-[var(--sidebar-text)] flex flex-col fixed h-full z-50 transition-transform duration-300 shadow-xl",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-bold text-xl tracking-tight">
            <div className="w-7 h-7 bg-[var(--accent-blue)] rounded-md flex items-center justify-center">
              <Rocket size={16} className="text-white" />
            </div>
            CAREERPULSE AI
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="md:hidden text-slate-400 p-1" onClick={() => setIsMobileMenuOpen(false)}>
              <X size={20} />
            </button>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-6">
          <button
            onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[14px] transition-all cursor-pointer",
              activeTab === 'dashboard' ? "bg-[var(--accent-blue)] text-white opacity-100 font-semibold" : "opacity-70 hover:opacity-100"
            )}
          >
            <LayoutDashboard size={18} />
            Dashboard
          </button>
          <button
            onClick={() => { setActiveTab('all-jobs'); setIsMobileMenuOpen(false); }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[14px] transition-all cursor-pointer",
              activeTab === 'all-jobs' ? "bg-[var(--accent-blue)] text-white opacity-100 font-semibold" : "opacity-70 hover:opacity-100"
            )}
          >
            <Search size={18} />
            Explore Jobs
          </button>
          <button
            onClick={() => { setActiveTab('applications'); setIsMobileMenuOpen(false); }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[14px] transition-all cursor-pointer",
              activeTab === 'applications' ? "bg-[var(--accent-blue)] text-white opacity-100 font-semibold" : "opacity-70 hover:opacity-100"
            )}
          >
            <Briefcase size={18} />
            Application Pipeline
          </button>
          <button
            onClick={() => { setActiveTab('profile'); setIsMobileMenuOpen(false); }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[14px] transition-all cursor-pointer",
              activeTab === 'profile' ? "bg-[var(--accent-blue)] text-white opacity-100 font-semibold" : "opacity-70 hover:opacity-100"
            )}
          >
            <UserIcon size={18} />
            Resume Manager
          </button>
          <button
            onClick={() => { setActiveTab('custom-cover-letter'); setIsMobileMenuOpen(false); }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[14px] transition-all cursor-pointer",
              activeTab === 'custom-cover-letter' ? "bg-[var(--accent-blue)] text-white opacity-100 font-semibold" : "opacity-70 hover:opacity-100"
            )}
          >
            <FileText size={18} />
            Custom Cover Letter
          </button>
          <button
            onClick={() => { setActiveTab('autopilot'); setIsMobileMenuOpen(false); }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[14px] transition-all cursor-pointer mt-2",
              activeTab === 'autopilot' ? "bg-slate-900 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.2)]" : "opacity-70 hover:opacity-100"
            )}
          >
            <Zap size={18} className={cn(activeTab === 'autopilot' ? "text-blue-400" : "")} />
            <div className="flex items-center justify-between flex-1">
              <span>AutoPilot</span>
              {jobs.filter(j => j.isAutoPilot && j.status === 'preparing').length > 0 && (
                <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              )}
            </div>
          </button>
          <button
            onClick={() => { setActiveTab('how-to'); setIsMobileMenuOpen(false); }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[14px] transition-all cursor-pointer mt-2",
              activeTab === 'how-to' ? "bg-[var(--accent-blue)] text-white opacity-100 font-semibold" : "opacity-70 hover:opacity-100"
            )}
          >
            <HelpCircle size={18} />
            How To Use
          </button>
        </nav>

        <div className="p-4 mt-auto border-t border-white/10 text-[12px]">
          <div className="flex items-center gap-3 px-4 py-3">
             <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden shrink-0 border border-white/10">
                {user.photoURL && <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />}
             </div>
             <div className="flex-1 min-w-0">
                <p className="font-bold truncate text-white">{user.displayName}</p>
                <p className="opacity-50 truncate">{user.email}</p>
             </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg opacity-60 hover:opacity-100 hover:bg-white/5 transition-all text-left"
          >
            <LogOut size={18} />
            Sign Out
          </button>
          <div className="px-4 py-4 mt-2 bg-white/5 rounded-lg border border-white/10">
             <p className="font-bold text-[var(--sidebar-text)]">Autonomous Sync</p>
             <p className="opacity-50 mt-1 uppercase text-[9px] tracking-tighter">
                Last checked: {lastSyncedAt ? lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
             </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-[240px] flex flex-col min-h-screen max-w-[100vw] md:max-w-none">
        {quotaHit && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-amber-500 text-xs font-medium">
              <AlertCircle size={14} />
              <span>AI Services are temporarily throttled (Rate Limit). Real-time features may be limited for a few minutes.</span>
            </div>
            <button 
              onClick={() => setQuotaHit(false)}
              className="text-amber-500 hover:text-amber-600 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-4 bg-[var(--bg-surface)] border-b border-[var(--border-color)] sticky top-0 z-30">
           <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
             <div className="w-6 h-6 bg-[var(--accent-blue)] rounded-md flex items-center justify-center">
               <Rocket size={14} className="text-white" />
             </div>
             CAREERPULSE
           </div>
           <div className="flex items-center gap-2">
             <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded-lg"
             >
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
             </button>
             <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -mr-2 text-[var(--text-secondary)]">
               <Menu size={24} />
             </button>
           </div>
        </div>

        <div className="p-4 sm:p-8 flex flex-col gap-8 flex-1 overflow-x-hidden pt-6">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-7xl mx-auto w-full flex flex-col gap-8"
            >
              <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight">Dashboard Overview</h2>
                  <div className="flex flex-wrap items-center gap-3 mt-1 sm:mt-0">
                    <p className="text-[var(--text-secondary)] text-sm">AI results and automated campaign status.</p>
                    {lastSyncedAt && (
                      <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded uppercase tracking-wider shrink-0">
                        Last Checked: {lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDailySync()}
                  disabled={isSearching}
                  className="btn-primary flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 w-full sm:w-auto shrink-0"
                >
                  {isSearching ? <RefreshCcw size={16} className="animate-spin" /> : <Plus size={16} />}
                  New Job Campaign
                </button>
              </header>

               {/* Stats Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                 <div 
                   className={cn(
                     "stat-card cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]",
                     statusFilter === 'applied-today' && "border-[var(--accent-blue)] bg-blue-50/50 shadow-blue-100"
                   )}
                   onClick={() => setStatusFilter('applied-today')}
                 >
                    <div className="text-[11px] text-[var(--text-secondary)] uppercase tracking-wider mb-2 font-bold">Applied Today</div>
                    <div className="text-3xl font-bold flex items-baseline gap-2 text-[var(--text-primary)]">
                       {metrics.appliedToday}
                       <span className="text-[12px] text-[var(--success-green)] font-medium">Real-time</span>
                    </div>
                 </div>
                 <div className="stat-card">
                    <div className="text-[11px] text-[var(--text-secondary)] uppercase tracking-wider mb-2 font-bold">Interviews/Offers</div>
                    <div className="text-3xl font-bold text-[var(--text-primary)]">
                       {metrics.interviews}
                    </div>
                    <div className="text-[12px] text-[var(--accent-blue)] mt-1 font-medium italic">Active pipeline</div>
                 </div>
                 <div className="stat-card">
                    <div className="text-[11px] text-[var(--text-secondary)] uppercase tracking-wider mb-2 font-bold">Total Applied</div>
                    <div className="text-3xl font-bold text-[var(--text-primary)]">
                       {metrics.totalApplied}
                    </div>
                    <div className="text-[12px] text-[var(--text-secondary)] mt-1">Verified submissions</div>
                 </div>
                 <div className="stat-card">
                    <div className="text-[11px] text-[var(--text-secondary)] uppercase tracking-wider mb-2 font-bold">Success Rate</div>
                    <div className="text-3xl font-bold text-[var(--text-primary)]">{metrics.successRate}%</div>
                    <div className="text-[12px] text-[var(--text-secondary)] mt-1">Conversion to interview</div>
                 </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 flex-1 min-h-0">
                <div className="panel h-full flex flex-col">
                   <div className="panel-header focus:outline-none">
                      <span>Recent High-Quality Matches</span>
                      <button onClick={() => setActiveTab('all-jobs')} className="text-[12px] text-[var(--accent-blue)] font-bold hover:underline">View All</button>
                   </div>
                   <div className="p-0 overflow-auto flex-1">
                      {jobs.filter(j => j.status === 'matched' && j.matchScore >= 80).length === 0 ? (
                        <div className="p-16 text-center">
                           <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                              <Sparkles className="text-[var(--accent-blue)]" size={32} />
                           </div>
                           <p className="text-[var(--text-secondary)] font-medium text-sm">No high-quality recent matches.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 p-5 gap-4">
                           {jobs
                            .filter(j => j.status === 'matched' && j.matchScore >= 80)
                            .slice(0, 3)
                            .map(job => (
                             <JobCard key={job.id} job={job} userProfile={profile} onApply={(id) => setApplyConfirmJobId(id)} />
                           ))}
                        </div>
                      )}
                   </div>
                </div>

                <div className="panel flex flex-col">
                   <div className="panel-header">
                      <span>Active Campaigns</span>
                   </div>
                   <div className="p-0 flex flex-col">
                      <div className="p-5 border-b border-[var(--border-color)] group hover:bg-slate-50 transition-colors cursor-pointer">
                         <div className="flex justify-between items-end mb-1">
                            <div>
                               <div className="text-sm font-bold text-[var(--text-primary)]">US Remote - Senior Dev</div>
                               <div className="text-[12px] text-[var(--text-secondary)]">240 matches • Daily limit: 50</div>
                            </div>
                         </div>
                         <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-3">
                            <div className="h-full bg-[var(--accent-blue)] w-[84%]" />
                         </div>
                      </div>
                      <div className="p-5 border-b border-[var(--border-color)] hover:bg-slate-50 transition-colors cursor-pointer">
                         <div className="flex justify-between items-end mb-1">
                            <div>
                               <div className="text-sm font-bold text-[var(--text-primary)]">Hybrid - NYC Fintech</div>
                               <div className="text-[12px] text-[var(--text-secondary)]">18 matches • Daily limit: 10</div>
                            </div>
                         </div>
                         <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-3">
                            <div className="h-full bg-[var(--accent-blue)] w-[30%]" />
                         </div>
                      </div>
                      <div className="p-8 text-center">
                         <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                            All systems operational. <br />
                            AI is checking for new matches every 15 minutes.
                         </p>
                      </div>
                   </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'all-jobs' && (
            <motion.div
              key="all-jobs"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-7xl mx-auto w-full flex flex-col gap-8 h-[calc(100vh-64px)]"
            >
              <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                 <div>
                    <h2 className="text-2xl font-bold tracking-tight">Explore Jobs</h2>
                    <p className="text-[var(--text-secondary)] text-sm mt-1 sm:mt-0">All matched opportunities based on your profile.</p>
                 </div>
                 <button onClick={() => handleDailySync()} disabled={isSearching} className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto shrink-0">
                    {isSearching ? <RefreshCcw size={16} className="animate-spin" /> : <Search size={16} />}
                    Scan Now
                 </button>
              </header>
              <div className="panel flex flex-col flex-1 min-h-0">
                 <div className="panel-header flex-col items-start gap-4 lg:flex-row lg:items-center">
                    <div className="flex items-center gap-4 justify-between w-full lg:w-auto">
                       <div className="flex items-center gap-3">
                          <span className="shrink-0">Filters</span>
                          <select 
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500/10 cursor-pointer"
                          >
                             <option value="Active">Active (Matched / Preparing / Ready)</option>
                             <option value="matched">Matched</option>
                             <option value="preparing">Preparing</option>
                             <option value="ready">Ready</option>
                             <option value="applied">Applied</option>
                             <option value="skipped">Skipped</option>
                             <option value="all">All Stages</option>
                          </select>
                       </div>
                    </div>
                    
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 sm:ml-auto no-scrollbar">
                      <button
                        onClick={() => setExcludeGov(!excludeGov)}
                        className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold transition-all shrink-0 uppercase tracking-wider flex items-center gap-1.5",
                          excludeGov 
                            ? "bg-amber-100 text-amber-700 border border-amber-200" 
                            : "bg-slate-50 text-slate-500 border border-slate-100 hover:border-slate-300"
                        )}
                      >
                        <Shield size={12} className={cn(excludeGov ? "text-amber-600" : "text-slate-400")} />
                        {excludeGov ? "No Gov/Clearance" : "All Sectors"}
                      </button>
                      <div className="h-4 w-[1px] bg-slate-200 mx-1 shrink-0" />
                      {['All', 'Startup', 'Mid-Size', 'Enterprise'].map(size => (
                        <button
                          key={size}
                          onClick={() => setCompanySizeFilter(size)}
                          className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-bold transition-all shrink-0 uppercase tracking-wider",
                            companySizeFilter === size 
                              ? "bg-slate-900 text-white shadow-md" 
                              : "bg-slate-50 text-slate-500 border border-slate-100 hover:border-slate-300"
                          )}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                 </div>
                 <div className="p-0 overflow-auto flex-1">
                    {jobs.length === 0 ? (
                      <div className="p-16 text-center">
                         <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Search className="text-slate-300" size={32} />
                         </div>
                         <p className="text-[var(--text-secondary)] font-medium">No matches found in your profile.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 p-5 gap-6">
                         {jobs
                          .filter(j => {
                            if (statusFilter === 'all') return true;
                            if (statusFilter === 'Active') return ['matched', 'preparing', 'ready'].includes(j.status);
                            return j.status === statusFilter;
                          })
                          .filter(j => {
                            if (!excludeGov) return true;
                            const text = `${j.title} ${j.company} ${j.description} ${j.fullDescription || ''}`.toLowerCase();
                            const govTerms = ['government', 'clearance', 'dod ', 'federal', 'secret', 'ts/sci', 'public trust', 'polygraph'];
                            return !govTerms.some(term => text.includes(term));
                          })
                          .filter(j => {
                            if (companySizeFilter === 'All') return true;
                            return j.companySize?.toLowerCase().includes(companySizeFilter.toLowerCase());
                          })
                          .map(job => (
                           <JobCard key={job.id} job={job} userProfile={profile} onApply={(id) => setApplyConfirmJobId(id)} />
                         ))}
                      </div>
                    )}
                 </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'applications' && (
            <motion.div
              key="applications"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-7xl mx-auto w-full flex flex-col gap-8"
            >
               <header>
                  <h2 className="text-2xl font-bold tracking-tight">Application Pipeline</h2>
                  <p className="text-[var(--text-secondary)] text-sm">Tracking {metrics.totalApplied} active submissions.</p>
               </header>

               <div className="panel">
                  <div className="panel-header">
                     <span>Recent Submissions</span>
                  </div>
                  <div className="overflow-hidden">
                    {metrics.totalApplied === 0 ? (
                       <div className="p-20 text-center text-[var(--text-secondary)] font-medium">
                          No active applications found in your pipeline.
                       </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-[var(--border-color)]">
                              <th className="px-6 py-3 text-[11px] uppercase text-[var(--text-secondary)] font-bold tracking-wider">Company</th>
                              <th className="px-6 py-3 text-[11px] uppercase text-[var(--text-secondary)] font-bold tracking-wider">Position</th>
                              <th className="px-6 py-3 text-[11px] uppercase text-[var(--text-secondary)] font-bold tracking-wider">Applied Date</th>
                              <th className="px-6 py-3 text-[11px] uppercase text-[var(--text-secondary)] font-bold tracking-wider">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {jobs.filter(j => ['applied', 'interviewing', 'offered', 'rejected'].includes(j.status)).map(job => (
                              <tr key={job.id} className="border-b border-[var(--border-color)] hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 font-bold text-sm text-[var(--text-primary)]">{job.company}</td>
                                <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">{job.title}</td>
                                <td className="px-6 py-4 text-sm text-[var(--text-secondary)] font-mono">
                                   {formatDate(job.appliedAt)}
                                </td>
                                <td className="px-6 py-4">
                                   <select 
                                     value={job.status} 
                                     onChange={(e) => handleUpdateJobStatus(job.id, e.target.value)}
                                     className={cn(
                                       "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider outline-none border",
                                       job.status === 'applied' && "bg-green-50 text-green-700 border-green-200",
                                       job.status === 'interviewing' && "bg-blue-50 text-blue-700 border-blue-200",
                                       job.status === 'offered' && "bg-amber-50 text-amber-700 border-amber-200",
                                       job.status === 'rejected' && "bg-slate-100 text-slate-700 border-slate-300"
                                     )}
                                   >
                                     <option value="applied">Applied</option>
                                     <option value="interviewing">Interviewing</option>
                                     <option value="offered">Offered</option>
                                     <option value="rejected">Rejected</option>
                                   </select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
               </div>
            </motion.div>
          )}

          {activeTab === 'autopilot' && (
            <motion.div
              key="autopilot"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full flex flex-col gap-8"
            >
              <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-3">
                    AutoPilot Log
                    <Zap className="text-blue-500 fill-blue-500/10" size={24} />
                  </h2>
                  <div className="flex items-center gap-3">
                    <p className="text-[var(--text-secondary)] text-sm">Autonomous preparations for high-confidence matches.</p>
                    {lastSyncedAt && (
                      <span className="text-[9px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                        Synced {lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto shrink-0">
                  <div className="flex items-center justify-center gap-3 bg-slate-100 px-4 py-2 rounded-full shrink-0 w-full sm:w-auto">
                    <div className={cn("w-2 h-2 rounded-full", profile?.preferences?.autoPilotEnabled ? "bg-green-500 animate-pulse" : "bg-slate-400")} />
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">System Status: {profile?.preferences?.autoPilotEnabled ? "Active" : "Offline"}</span>
                  </div>
                  {profile?.preferences?.autoPilotEnabled && jobs.length > 0 && (
                    <button 
                      onClick={() => {
                        const topJob = jobs.find(j => j.status === 'matched');
                        if (topJob) handleAutoPilot(topJob, topJob.id, true);
                      }}
                      disabled={isAutoPilotTesting}
                      className={cn(
                        "flex items-center justify-center gap-2 px-6 py-2 bg-slate-900 text-white rounded-full text-xs font-bold hover:bg-slate-800 transition-all shadow-lg w-full sm:w-auto",
                        isAutoPilotTesting && "opacity-80 active:scale-95 cursor-not-allowed"
                      )}
                    >
                      {isAutoPilotTesting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                      {isAutoPilotTesting ? "In Progress..." : "Force AutoPilot Test"}
                    </button>
                  )}
                </div>
              </header>

              <AnimatePresence>
                {isAutoPilotTesting && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-blue-600/5 border border-blue-500/20 rounded-3xl p-6 flex flex-col sm:flex-row items-center gap-6 shadow-sm">
                      <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-blue-500/20">
                        <Rocket className="animate-bounce" size={24} />
                      </div>
                      <div className="flex-1 text-center sm:text-left">
                        <h4 className="font-bold text-slate-900 mb-1">AI Agent in Motion</h4>
                        <p className="text-sm text-slate-500 font-medium">The system is currently simulating a high-confidence match workflow.</p>
                      </div>
                      <div className="flex flex-col items-center sm:items-end gap-2 shrink-0 w-full sm:w-auto">
                        <div className="flex items-center gap-3">
                           <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest animate-pulse">{autoPilotStep}</span>
                           <Loader2 size={16} className="text-blue-500 animate-spin" />
                        </div>
                        <div className="w-full sm:w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                           <motion.div 
                             className="h-full bg-blue-600"
                             initial={{ width: "10%" }}
                             animate={{ 
                               width: autoPilotStep?.includes("Analyzing") ? "40%" : 
                                      autoPilotStep?.includes("Finalizing") ? "70%" : 
                                      autoPilotStep?.includes("Dispatching") ? "90%" : "10%"
                             }}
                             transition={{ duration: 1 }}
                           />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {jobs.filter(j => j.isAutoPilot).length === 0 ? (
                  <div className="col-span-full py-20 text-center bg-[var(--bg-surface)] border border-dashed border-[var(--border-color)] rounded-3xl">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                      <Zap size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">No autonomous actions yet</h3>
                    <p className="text-sm text-slate-500 max-w-sm mx-auto mt-2">
                      When matches exceed 90% and AutoPilot is enabled, they'll appear here automatically prepped.
                    </p>
                    <button 
                      onClick={() => setActiveTab('profile')}
                      className="mt-6 text-blue-600 text-sm font-bold hover:underline"
                    >
                      Configure AutoPilot Settings →
                    </button>
                  </div>
                ) : (
                  jobs.filter(j => j.isAutoPilot).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(job => (
                    <JobCard key={job.id} job={job} userProfile={profile} onApply={(id) => setApplyConfirmJobId(id)} />
                  ))
                )}
              </div>

              {/* Detailed Activity Logs */}
              <div className="panel overflow-hidden">
                <div className="panel-header py-4 px-6 border-b border-[var(--border-color)] bg-[var(--bg-surface)] sticky top-0 z-10 flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <Activity size={18} className="text-blue-500" />
                      <span className="font-bold tracking-tight text-sm uppercase">Detailed System Activity Logs</span>
                   </div>
                   <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Real-time Stream</span>
                   </div>
                </div>
                <div className="bg-slate-50/50 max-h-[500px] overflow-y-auto">
                   {logs.length === 0 ? (
                      <div className="p-16 text-center text-slate-400 italic text-sm">
                         Waiting for autonomous activity...
                      </div>
                   ) : (
                      <div className="flex flex-col">
                         {logs.map((log, i) => (
                            <div 
                               key={log.id} 
                               className={cn(
                                  "p-5 border-b border-[var(--border-color)] hover:bg-[var(--bg-main)] transition-all group flex gap-4 bg-[var(--bg-surface)]/40",
                                  i === 0 && "bg-blue-50/30 border-blue-100"
                               )}
                            >
                               <div className="shrink-0 mt-1">
                                  {log.status === 'success' ? (
                                     <div className="w-8 h-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center">
                                        <CheckCircle2 size={14} />
                                     </div>
                                  ) : log.status === 'error' ? (
                                     <div className="w-8 h-8 rounded-full bg-red-50 text-red-600 flex items-center justify-center animate-pulse">
                                        <AlertCircle size={14} />
                                     </div>
                                  ) : (
                                     <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                                        <Activity size={14} />
                                     </div>
                                  )}
                               </div>
                               <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-4 mb-1">
                                     <div className="flex flex-wrap items-center gap-2">
                                        <span className={cn(
                                           "text-xs font-bold",
                                           log.status === 'error' ? "text-red-600" : "text-slate-900"
                                        )}>{log.action}</span>
                                        <span className="text-[10px] text-slate-400">•</span>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{log.jobTitle}</span>
                                        <span className="text-[10px] text-slate-300">@</span>
                                        <span className="text-[10px] font-bold text-blue-600">{log.company}</span>
                                     </div>
                                     <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                        {formatLogTime(log.timestamp)}
                                     </span>
                                  </div>
                                  <p className={cn(
                                     "text-[11px] leading-relaxed max-w-3xl",
                                     log.status === 'error' ? "text-red-500" : "text-slate-600"
                                  )}>
                                     {log.details}
                                  </p>
                               </div>
                            </div>
                         ))}
                      </div>
                   )}
                </div>
              </div>
            </motion.div>
          )}
          
          {activeTab === 'how-to' && (
            <motion.div
              key="how-to"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-4xl mx-auto w-full flex flex-col gap-8"
            >
              <header>
                <h2 className="text-2xl font-bold tracking-tight">How To Use CareerPulse AI</h2>
                <p className="text-[var(--text-secondary)] text-sm">Your guide to maximizing the AI-powered job application assistant.</p>
              </header>

              <div className="panel p-8 space-y-8">
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-blue-600 flex items-center gap-2">
                    <UserIcon size={20} />
                    1. Setup Your Profile
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    Start by going to the <strong>Resume Manager</strong> tab. Paste your current resume or career summary into the text box and click "Analyze & Save". Our AI will extract your skills, generate a professional summary, and identify roles you're best suited for. You can also provide specific criteria to filter jobs such as preferred locations, industries, and minimum salaries.
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-amber-600 flex items-center gap-2">
                    <Search size={20} />
                    2. Explore Jobs
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    Navigate to the <strong>Explore Jobs</strong> tab to see roles matching your profile. CareerPulse uses Gemini AI to scan the job market and match you based on your resume. You can customize your search further by editing your Job Discovery settings directly on this page. Wait for the scan to finish, and review why you are a good match for each role in the "AI Matching Intel" section.
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-green-600 flex items-center gap-2">
                    <Briefcase size={20} />
                    3. Manage Applications
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    Once you find a job you like, click <strong>"Prepare Submission"</strong>. The AI will write a tailored cover letter and adapt your career summary specifically for that job based on the company's requirements. Review the generated assets, make changes if necessary, and use the provided links to apply on the company's platform. After applying, track your status under the <strong>Application Pipeline</strong> tab.
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-purple-600 flex items-center gap-2">
                    <Zap size={20} />
                    4. AutoPilot (Premium)
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    With AutoPilot turned on, CareerPulse continually monitors for new job postings that perfectly fit your profile. When a high-confidence match is found, AutoPilot automatically prepares a cover letter and notification. You can enable email notifications in your Resume Manager to get an alert the moment a top-tier role hits the market.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'custom-cover-letter' && (
            <motion.div
              key="custom-cover-letter"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-6xl mx-auto w-full flex flex-col gap-8"
            >
              <header>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Custom Cover Letter Generator</h2>
                    <p className="text-[var(--text-secondary)] text-sm">Generate a perfectly tailored cover letter for any job, even those not listed in the app.</p>
                  </div>
                  {profile?.resumeText ? (
                    <div className="px-3 py-1.5 bg-green-500/10 border border-green-500/20 text-green-600 rounded-lg text-xs font-semibold flex items-center gap-1.5 self-start sm:self-center">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      Resume Linked
                    </div>
                  ) : (
                    <div className="px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-600 rounded-lg text-xs font-semibold flex items-center gap-1.5 self-start sm:self-center">
                      <div className="w-2 h-2 rounded-full bg-rose-500" />
                      Add Resume First
                    </div>
                  )}
                </div>
              </header>

              {(!profile?.resumeText && !resumeText) && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-5 rounded-2xl flex items-start gap-4">
                  <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                  <div>
                    <h4 className="text-sm font-bold text-[var(--text-primary)]">Resume Not Found</h4>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 mb-3">
                      You haven't uploaded or analyzed your resume in the **Resume Manager** yet. Our AI needs your resume or career details to generate a highly tailored, custom cover letter.
                    </p>
                    <button 
                      onClick={() => setActiveTab('profile')}
                      className="px-4 py-2 bg-[var(--accent-blue)] text-white text-xs font-bold rounded-xl hover:bg-opacity-95 transition-all inline-flex items-center gap-1.5"
                    >
                      Go to Resume Manager <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Form Column */}
                <div className="lg:col-span-5 flex flex-col gap-6">
                  <div className="panel">
                    <div className="panel-header">
                      <span>Job Requirements / Details</span>
                    </div>
                    <form onSubmit={handleGenerateCustomCoverLetter} className="p-6 space-y-5">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                          Company Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={customCompany}
                          onChange={(e) => setCustomCompany(e.target.value)}
                          placeholder="e.g. Google, Acme Corp"
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:outline-none focus:border-blue-500/50 transition-all font-semibold text-slate-800"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                          Job Title / Position <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={customJobTitle}
                          onChange={(e) => setCustomJobTitle(e.target.value)}
                          placeholder="e.g. Senior Frontend Developer"
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:outline-none focus:border-blue-500/50 transition-all font-semibold text-slate-800"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                            Location (Optional)
                          </label>
                          <input
                            type="text"
                            value={customLocation}
                            onChange={(e) => setCustomLocation(e.target.value)}
                            placeholder="e.g. London / Remote"
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:outline-none focus:border-blue-500/50 transition-all font-semibold text-slate-800"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                            Job Type
                          </label>
                          <select
                            value={customJobType}
                            onChange={(e) => setCustomJobType(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:outline-none focus:border-blue-500/50 transition-all font-semibold text-slate-800"
                          >
                            <option value="Full-time">Full-time</option>
                            <option value="Part-time">Part-time</option>
                            <option value="Contract">Contract</option>
                            <option value="Internship">Internship</option>
                            <option value="Remote">Remote Only</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                            Salary (Optional)
                          </label>
                          <input
                            type="text"
                            value={customSalary}
                            onChange={(e) => setCustomSalary(e.target.value)}
                            placeholder="e.g. $120,000 / yr"
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:outline-none focus:border-blue-500/50 transition-all font-semibold text-slate-800"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                            Job URL (Optional)
                          </label>
                          <input
                            type="url"
                            value={customJobUrl}
                            onChange={(e) => setCustomJobUrl(e.target.value)}
                            placeholder="e.g. https://careers.co/job"
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:outline-none focus:border-blue-500/50 transition-all font-semibold text-slate-800"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                          Job Description / Core Requirements <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          required
                          rows={8}
                          value={customDescription}
                          onChange={(e) => setCustomDescription(e.target.value)}
                          placeholder="Paste key info, requirements, or full description of the job here..."
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:outline-none focus:border-blue-500/50 transition-all font-mono text-xs leading-relaxed text-slate-800"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isGeneratingCustom || (!profile?.resumeText && !resumeText)}
                        className="w-full btn-primary py-3.5 flex items-center justify-center gap-2 text-sm font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isGeneratingCustom ? (
                          <>
                            <Loader2 className="animate-spin" size={16} />
                            AI is Writing Your Letter...
                          </>
                        ) : (
                          <>
                            <Sparkles size={16} />
                            Generate Tailored Cover Letter
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Result Column */}
                <div className="lg:col-span-7 flex flex-col gap-6">
                  <div className="panel flex-1 flex flex-col h-full min-h-[500px]">
                    <div className="panel-header flex items-center justify-between">
                      <span>Tailored Cover Letter Output</span>
                      {customCoverLetter && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(customCoverLetter);
                            setIsCustomCopied(true);
                            setTimeout(() => setIsCustomCopied(false), 2000);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors uppercase tracking-wider"
                        >
                          {isCustomCopied ? (
                            <>
                              <CheckCircle2 size={13} className="text-green-500" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <FileText size={13} />
                              Copy Text
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <div className="flex-1 p-6 flex flex-col">
                      {customCoverLetter ? (
                        <div className="space-y-6 flex-1 flex flex-col">
                          <div className="bg-slate-50 border rounded-2xl p-6 font-sans text-sm text-[var(--text-primary)] leading-relaxed flex-1 overflow-y-auto whitespace-pre-wrap max-h-[500px] border-[var(--border-color)]">
                            <div className="markdown-body text-slate-800">
                              <Markdown>{customCoverLetter}</Markdown>
                            </div>
                          </div>

                          {/* Save to Pipeline Area */}
                          <div className="p-5 bg-blue-50/50 border border-blue-100 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div className="space-y-1">
                              <h4 className="text-xs font-bold text-blue-950 flex items-center gap-1.5 uppercase tracking-wider">
                                <Briefcase size={14} className="text-blue-600" />
                                Add to Application Pipeline
                              </h4>
                              <p className="text-xs text-blue-800">
                                Tracking custom applications helps keep your pipeline organized in one unified feed.
                              </p>
                              {customSaveSuccess && (
                                <p className="text-xs text-green-600 font-bold flex items-center gap-1 mt-1 transition-all">
                                  <CheckCircle2 size={12} /> Saved to Pipeline successfully!
                                </p>
                              )}
                            </div>
                            
                            <div className="flex items-stretch sm:items-center gap-2 shrink-0 w-full sm:w-auto">
                              <select
                                value={customStatus}
                                onChange={(e) => setCustomStatus(e.target.value)}
                                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider outline-none text-slate-700"
                              >
                                <option value="applied">Applied</option>
                                <option value="preparing">Preparing</option>
                                <option value="interviewing">Interviewing</option>
                              </select>

                              <button
                                onClick={handleSaveCustomToPipeline}
                                disabled={customSaveSuccess}
                                className={cn(
                                  "px-4 py-2 text-xs font-bold rounded-xl transition-all shadow-md shrink-0 flex-1 sm:flex-none",
                                  customSaveSuccess 
                                    ? "bg-green-100 text-green-700 border border-green-200" 
                                    : "bg-blue-600 text-white hover:bg-blue-700"
                                )}
                              >
                                {customSaveSuccess ? "Saved ✓" : "Save Job"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-10 opacity-70">
                          <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mb-4 border border-blue-100">
                            <Sparkles size={28} className={cn(isGeneratingCustom ? "animate-spin text-blue-500" : "text-blue-500")} />
                          </div>
                          {isGeneratingCustom ? (
                            <>
                              <h3 className="text-base font-bold text-[var(--text-primary)]">AI Writer is Active</h3>
                              <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm">
                                Gemini is analyzing your resume against the job description to write a professional Cover Letter. This typically takes 3-5 seconds.
                              </p>
                            </>
                          ) : (
                            <>
                              <h3 className="text-base font-bold text-[var(--text-primary)]">Draft Your Custom Cover Letter</h3>
                              <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm">
                                Complete the job details on the left, and watch the AI produce a highly tailored, engaging cover letter formatted perfectly for copying.
                              </p>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-4xl mx-auto w-full flex flex-col gap-8"
            >
              <header>
                <h2 className="text-2xl font-bold tracking-tight">Resume Manager</h2>
                <p className="text-[var(--text-secondary)] text-sm">Update your career specifications for better AI matching.</p>
              </header>

              <div className="panel">
                 <div className="panel-header">
                    <span>Career Details</span>
                    <button
                        onClick={handleUpdateProfile}
                        disabled={isUpdatingProfile || !resumeText}
                        className="btn-primary flex items-center gap-2"
                    >
                        {isUpdatingProfile && <Loader2 className="animate-spin" size={16} />}
                        Analyze & Save
                    </button>
                 </div>
                 <div className="p-6 space-y-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                          <Linkedin size={12} className="text-blue-600" />
                          LinkedIn Profile URL
                       </label>
                       <input 
                          type="url"
                          value={linkedinUrl}
                          onChange={(e) => setLinkedinUrl(e.target.value)}
                          placeholder="https://linkedin.com/in/username"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:outline-none focus:border-blue-500/50 transition-all font-medium"
                       />
                    </div>

                    <div className="flex flex-col gap-4">
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="group flex flex-col items-center justify-center p-8 border-2 border-dashed border-[var(--border-color)] rounded-2xl hover:border-[var(--accent-blue)] hover:bg-blue-50/50 transition-all cursor-pointer"
                      >
                        <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center text-slate-400 group-hover:bg-blue-100 group-hover:text-[var(--accent-blue)] transition-all mb-4">
                          {isUploadingFile ? <Loader2 className="animate-spin" /> : <Upload size={24} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[var(--text-primary)] leading-none">Drop resume here or click to upload</p>
                          <p className="text-xs text-[var(--text-secondary)] mt-2">Supports PDF and TXT formats</p>
                        </div>
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          onChange={handleFileUpload} 
                          accept=".pdf,.txt" 
                          className="hidden" 
                        />
                      </div>
                      
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-[var(--border-color)]"></div>
                        </div>
                        <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest text-slate-400">
                          <span className="bg-[var(--bg-surface)] px-3">or paste content manually</span>
                        </div>
                      </div>
                    </div>

                    <textarea
                        value={resumeText}
                        onChange={(e) => setResumeText(e.target.value)}
                        placeholder="Paste resume text or career biography..."
                        className="w-full h-80 p-5 rounded-lg border border-[var(--border-color)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 focus:outline-none text-[14px] leading-relaxed text-[var(--text-primary)] transition-all"
                    />
                 </div>
              </div>

              {profile?.summary && (
                <div className="panel">
                   <div className="panel-header">
                      <span>Career Summary</span>
                   </div>
                   <div className="p-6">
                      <p className="text-[14px] leading-relaxed text-[var(--text-secondary)] italic">
                         "{profile.summary}"
                      </p>
                   </div>
                </div>
              )}

              {profile?.preferences?.roles?.length > 0 && (
                <div className="panel">
                   <div className="panel-header">
                      <span>Matching Insights</span>
                   </div>
                   <div className="p-6 flex flex-col gap-3">
                      <p className="text-xs text-[var(--text-secondary)] font-medium mb-1">AI identifies you as a strong match for these roles:</p>
                      <div className="flex flex-wrap gap-2">
                        {profile.preferences.roles.map((role: string, i: number) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-[var(--accent-blue)] rounded-lg border border-blue-100">
                            <Sparkles size={12} />
                            <span className="text-[12px] font-bold">{role}</span>
                          </div>
                        ))}
                      </div>
                   </div>
                </div>
              )}

              {profile?.skills?.length > 0 && (
                <div className="panel">
                   <div className="panel-header">
                      <span>Verified Skills</span>
                   </div>
                   <div className="p-6 flex flex-wrap gap-2">
                       {profile.skills.map((skill: string, i: number) => (
                        <span key={i} className="px-3 py-1 bg-[var(--bg-main)] text-[var(--text-primary)] rounded border border-[var(--border-color)] text-[11px] font-bold tracking-tight">
                          {skill.toUpperCase()}
                        </span>
                      ))}
                   </div>
                </div>
              )}

               <div className="panel">
                 <div className="panel-header">
                    <div className="flex items-center gap-2">
                       <Users size={16} />
                       <span>Professional References</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-normal uppercase tracking-widest">Optional for Portals</span>
                 </div>
                 <div className="p-6 space-y-6">
                    {/* Add Reference Form */}
                     <form onSubmit={handleAddReference} className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100" id="refForm">
                       <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Full Name *</label>
                          <input 
                              value={refFormData.name}
                              onChange={(e) => setRefFormData({...refFormData, name: e.target.value})}
                              required 
                              placeholder="Jane Doe" 
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10" 
                           />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Relationship *</label>
                          <input 
                              value={refFormData.relationship}
                              onChange={(e) => setRefFormData({...refFormData, relationship: e.target.value})}
                              required 
                              placeholder="Former Manager" 
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10" 
                           />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Company</label>
                          <input 
                              value={refFormData.company}
                              onChange={(e) => setRefFormData({...refFormData, company: e.target.value})}
                              placeholder="TechCorp Inc." 
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10" 
                           />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Email / Phone</label>
                          <input 
                              value={refFormData.email}
                              onChange={(e) => setRefFormData({...refFormData, email: e.target.value})}
                              placeholder="jane@example.com" 
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10" 
                           />
                       </div>
                       <div className="md:col-span-2 flex gap-2">
                          <button type="submit" className="flex-1 py-2 bg-[var(--accent-blue)] text-white rounded-lg text-xs font-bold hover:bg-blue-600 transition-all flex items-center justify-center gap-2">
                             {editingRefIndex !== null ? <Edit2 size={14} /> : <Plus size={14} />}
                             {editingRefIndex !== null ? 'Update Reference' : 'Add Reference'}
                          </button>
                          {editingRefIndex !== null && (
                             <button 
                                type="button"
                                onClick={() => {
                                   setEditingRefIndex(null);
                                   setRefFormData({ name: '', relationship: '', company: '', email: '', phone: '' });
                                }}
                                className="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-300 transition-all"
                             >
                                Cancel
                             </button>
                          )}
                       </div>
                    </form>

                    {/* Reference List */}
                    <div className="space-y-3">
                       {references.length === 0 ? (
                          <p className="text-center py-4 text-xs text-slate-400 italic">No references added yet.</p>
                       ) : (
                          references.map((ref, idx) => (
                             <div key={idx} className="flex items-center justify-between p-4 border border-[var(--border-color)] rounded-xl hover:border-blue-100 transition-colors bg-[var(--bg-surface)] group">
                                <div className="flex items-center gap-4">
                                   <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 font-bold text-xs uppercase">
                                      {ref.name?.[0] || 'R'}
                                   </div>
                                   <div>
                                      <p className="text-sm font-bold text-slate-900">{ref.name}</p>
                                      <p className="text-[10px] text-slate-500 font-medium">{ref.relationship} {ref.company && `at ${ref.company}`}</p>
                                      {ref.email && <p className="text-[10px] text-[var(--accent-blue)] cursor-pointer hover:underline">{ref.email}</p>}
                                   </div>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                   <button 
                                      onClick={() => handleEditReference(idx)}
                                      className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                      title="Edit Reference"
                                   >
                                      <Edit2 size={14} />
                                   </button>
                                   <button 
                                      onClick={() => handleDeleteReference(idx)}
                                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                      title="Delete Reference"
                                   >
                                      <Trash2 size={14} />
                                   </button>
                                </div>
                             </div>
                          ))
                       )}
                    </div>
                 </div>
               </div>

              <div className="panel">
                <div className="panel-header py-4 px-6 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Search size={16} className="text-slate-500" />
                    <span className="font-bold tracking-tight">Search Criteria</span>
                  </div>
                  {!isEditingSearchCriteria ? (
                    <button 
                      onClick={() => setIsEditingSearchCriteria(true)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg transition-all"
                    >
                      Edit Parameters
                    </button>
                  ) : (
                    <button 
                      onClick={handleSaveSearchCriteria}
                      className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-all shadow-sm"
                    >
                      Save Criteria
                    </button>
                  )}
                </div>
                <div className="p-6 space-y-4">
                  {isEditingSearchCriteria ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Job Titles (comma-separated)</label>
                        <input 
                          type="text"
                          value={searchCriteria.roles}
                          onChange={(e) => setSearchCriteria({ ...searchCriteria, roles: e.target.value })}
                          placeholder="Software Engineer, Product Manager"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:outline-none focus:border-blue-500/50 transition-all font-medium text-left"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Desired Industries (comma-separated)</label>
                        <input 
                          type="text"
                          value={searchCriteria.industries}
                          onChange={(e) => setSearchCriteria({ ...searchCriteria, industries: e.target.value })}
                          placeholder="Finance, Healthcare, Tech"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:outline-none focus:border-blue-500/50 transition-all font-medium text-left"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Locations (comma-separated)</label>
                        <input 
                          type="text"
                          value={searchCriteria.locations}
                          onChange={(e) => setSearchCriteria({ ...searchCriteria, locations: e.target.value })}
                          placeholder="Remote, New York, London"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:outline-none focus:border-blue-500/50 transition-all font-medium text-left"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Minimum Annual Salary ($)</label>
                        <input 
                          type="number"
                          value={searchCriteria.minSalary}
                          onChange={(e) => setSearchCriteria({ ...searchCriteria, minSalary: e.target.value })}
                          placeholder="80000"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:outline-none focus:border-blue-500/50 transition-all font-medium text-left"
                        />
                      </div>
                      <div className="space-y-2 text-left">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Company Size</label>
                        <select 
                          value={searchCriteria.companySize}
                          onChange={(e) => setSearchCriteria({ ...searchCriteria, companySize: e.target.value })}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:outline-none focus:border-blue-500/50 transition-all font-medium"
                        >
                          <option value="">Any Size</option>
                          <option value="Startup (1-50)">Startup (1-50)</option>
                          <option value="Mid-Size (51-500)">Mid-Size (51-500)</option>
                          <option value="Enterprise (500+)">Enterprise (500+)</option>
                        </select>
                      </div>
                      <div className="space-y-2 text-left">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Job Type</label>
                        <select 
                          value={searchCriteria.jobType}
                          onChange={(e) => setSearchCriteria({ ...searchCriteria, jobType: e.target.value })}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:outline-none focus:border-blue-500/50 transition-all font-medium"
                        >
                          <option value="">Any Type</option>
                          <option value="Full-time">Full-time</option>
                          <option value="Contract">Contract</option>
                          <option value="Part-time">Part-time</option>
                          <option value="Internship">Internship</option>
                        </select>
                      </div>
                      <div className="space-y-2 md:col-span-2 text-left">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Specific Technologies (comma-separated)</label>
                        <input 
                          type="text"
                          value={searchCriteria.technologies}
                          onChange={(e) => setSearchCriteria({ ...searchCriteria, technologies: e.target.value })}
                          placeholder="React, AWS, Python, Docker"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:outline-none focus:border-blue-500/50 transition-all font-medium"
                        />
                      </div>
                      <div className="md:col-span-2 flex items-center gap-3 p-4 bg-amber-50/50 rounded-xl border border-amber-100 text-left">
                        <div className="w-5 h-5 flex items-center justify-center">
                          <input 
                            type="checkbox"
                            checked={searchCriteria.excludeGov}
                            onChange={(e) => setSearchCriteria({ ...searchCriteria, excludeGov: e.target.checked })}
                            className="w-4 h-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500 cursor-pointer"
                          />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-amber-900">Exclude Government & Clearance Roles</p>
                          <p className="text-[10px] text-amber-700 font-medium italic opacity-80">Removes roles requiring security clearance or government agency specific postings.</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pb-4">
                       <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col gap-1 hover:border-slate-300 transition-colors">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider text-left">Titles</span>
                          <span className="text-sm font-bold text-slate-900 break-words text-left">{searchCriteria.roles || "Any"}</span>
                       </div>
                       <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col gap-1 hover:border-slate-300 transition-colors">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider text-left">Industries</span>
                          <span className="text-sm font-bold text-slate-900 break-words text-left">{searchCriteria.industries || "Any"}</span>
                       </div>
                       <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col gap-1 hover:border-slate-300 transition-colors text-left">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Job Type & Size</span>
                          <span className="text-sm font-bold text-slate-900 break-words">
                            {searchCriteria.jobType || "Any"} {searchCriteria.companySize ? `• ${searchCriteria.companySize}` : ""}
                            {(searchCriteria.jobType || searchCriteria.companySize) ? "" : "Not Set"}
                          </span>
                       </div>
                       <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col gap-1 hover:border-slate-300 transition-colors text-left">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Min Salary</span>
                          <span className="text-sm font-bold text-slate-900">{searchCriteria.minSalary ? `$${parseFloat(searchCriteria.minSalary).toLocaleString()}` : "Not Set"}</span>
                       </div>
                       <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col gap-1 hover:border-slate-300 transition-colors text-left">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Gov/Clearance</span>
                          <span className={cn(
                            "text-sm font-bold break-words",
                            searchCriteria.excludeGov ? "text-amber-600" : "text-slate-900"
                          )}>
                            {searchCriteria.excludeGov ? "Excluding Roles" : "All Sectors"}
                          </span>
                       </div>
                    </div>
                  )}
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between p-4 bg-slate-900 text-white rounded-xl shadow-lg border border-slate-800">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                          <Rocket size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-bold">Autonomous Auto-Pilot</p>
                          <p className="text-xs opacity-60">Automatically prepare applications for {">"}95% matches</p>
                        </div>
                      </div>
                      <button 
                        onClick={handleToggleAutoPilot}
                        className={cn(
                          "w-12 h-6 rounded-full p-1 transition-all duration-300",
                          autoPilotStatus ? "bg-blue-500" : "bg-slate-700"
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 translate-x-0",
                          autoPilotStatus && "translate-x-6"
                        )} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                          <AlertCircle size={20} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[var(--text-primary)]">Email Notifications</p>
                          <p className="text-xs text-[var(--text-secondary)]">Receive email alerts when AutoPilot finds a match</p>
                        </div>
                      </div>
                      <button 
                        onClick={handleToggleEmailNotifications}
                        className={cn(
                          "w-12 h-6 rounded-full p-1 transition-all duration-300",
                          profile?.preferences?.emailNotificationsEnabled ? "bg-blue-500" : "bg-[var(--border-color)]"
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-300 translate-x-0",
                          profile?.preferences?.emailNotificationsEnabled && "translate-x-6"
                        )} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </main>

      {/* AI Submission Hub */}
      <AnimatePresence>
        {autoPilotConfirmJob && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-[var(--bg-surface)] rounded-3xl p-8 max-w-md w-full shadow-2xl border border-[var(--border-color)]"
            >
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <Rocket size={32} />
              </div>
              <h3 className="text-2xl font-bold text-center text-[var(--text-primary)] mb-2">AutoPilot Match Found!</h3>
              <p className="text-[var(--text-secondary)] text-center text-sm leading-relaxed mb-6">
                AutoPilot found a &gt;95% match for <span className="font-bold text-[var(--text-primary)]">{autoPilotConfirmJob.job.title}</span> at <span className="font-bold text-[var(--text-primary)]">{autoPilotConfirmJob.job.company}</span>. 
              </p>
              
              <p className="text-slate-500 text-center text-sm leading-relaxed mb-8">
                Would you like the AI to automatically prepare a submission for this role?
              </p>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => {
                    handleAutoPilot(autoPilotConfirmJob.job, autoPilotConfirmJob.jobId);
                    setAutoPilotConfirmJob(null);
                  }}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                >
                  Confirm Autonomous Preparation
                </button>
                <button 
                  onClick={() => setAutoPilotConfirmJob(null)}
                  className="w-full py-4 bg-[var(--bg-main)] text-[var(--text-secondary)] rounded-2xl font-bold hover:bg-slate-200/50 transition-all"
                >
                  Skip For Now
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {applyConfirmJobId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-[var(--bg-surface)] rounded-3xl p-8 max-w-md w-full shadow-2xl border border-[var(--border-color)]"
            >
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <Rocket size={32} />
              </div>
              <h3 className="text-2xl font-bold text-center text-[var(--text-primary)] mb-2">Initiate Submission?</h3>
              <p className="text-[var(--text-secondary)] text-center text-sm leading-relaxed mb-6">
                This will trigger the AI to analyze your resume and generate a tailored cover letter for 
                <span className="font-bold text-[var(--text-primary)]"> {jobs.find(j => j.id === applyConfirmJobId)?.company}</span>. 
              </p>

              {urlError ? (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
                  <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                  <div>
                    <p className="text-xs font-bold text-red-700">Link Validation Failed</p>
                    <p className="text-[10px] text-red-600 leading-tight mt-1">{urlError}</p>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-center text-sm leading-relaxed mb-8">
                  Are you ready to proceed?
                </p>
              )}

              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => handleApply(applyConfirmJobId)}
                  disabled={isPreparingSubmission}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isValidatingUrl ? (
                    <>
                      <RefreshCcw size={18} className="animate-spin" />
                      Checking Portal Link...
                    </>
                  ) : isPreparingSubmission ? (
                    <>
                      <RefreshCcw size={18} className="animate-spin" />
                      Engaging AI Engines...
                    </>
                  ) : (
                    "Yes, Start Mission"
                  )}
                </button>
                <button 
                  onClick={() => {
                    setApplyConfirmJobId(null);
                    setUrlError(null);
                  }}
                  className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                >
                  Maybe Later
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {currentSubmission && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.98, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 20 }}
              className="bg-[var(--bg-surface)] rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden border border-[var(--border-color)]"
            >
              {/* Header */}
              <div className="px-8 py-5 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-main)]/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                    <Rocket size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                       Submission Mission Control
                       <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-widest">AI Optimized</span>
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)] font-medium">{currentSubmission.job.title} @ {currentSubmission.job.company}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setCurrentSubmission(null)}
                  className="p-2 hover:bg-[var(--bg-main)] rounded-lg transition-colors"
                >
                  <X size={20} className="text-[var(--text-secondary)]" />
                </button>
              </div>

              {/* Grid Content */}
              <div className="flex-1 overflow-y-auto lg:overflow-hidden grid grid-cols-1 lg:grid-cols-2">
                
                {/* Tailored Resume Column */}
                <div className="flex flex-col border-b lg:border-b-0 lg:border-r border-slate-100 min-h-[300px] lg:min-h-0">
                  <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between sticky top-0 z-10">
                     <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <FileText size={12} />
                        Tailored Resume Text
                     </span>
                     <button 
                        onClick={() => navigator.clipboard.writeText(currentSubmission.tailoredResume)}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-1 rounded"
                     >
                        COPY TEXT
                     </button>
                  </div>
                  <div className="flex-1 overflow-auto lg:overflow-y-auto p-4 sm:p-8 font-mono text-[13px] leading-relaxed text-slate-700 whitespace-pre-wrap bg-slate-50/20">
                    {currentSubmission.tailoredResume}
                  </div>
                </div>

                {/* Cover Letter Column */}
                <div className="flex flex-col min-h-[300px] lg:min-h-0">
                  <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between sticky top-0 z-10">
                     <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <Sparkles size={12} />
                        Optimized Cover Letter
                     </span>
                     <button 
                        onClick={() => navigator.clipboard.writeText(currentSubmission.coverLetter)}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-1 rounded"
                     >
                        COPY TEXT
                     </button>
                  </div>
                  <div className="flex-1 overflow-auto lg:overflow-y-auto p-4 sm:p-8 prose prose-slate max-w-none prose-sm">
                    <Markdown>{currentCoverLetter || currentSubmission.coverLetter}</Markdown>
                  </div>
                </div>
              </div>

              {/* Reference Quick Access Bar */}
              {references.length > 0 && (
                 <div className="px-8 py-3 bg-slate-50 border-y border-slate-100 overflow-x-auto">
                    <div className="flex items-center gap-6 min-w-max">
                       <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <Users size={12} />
                          Reference Quick-Copy:
                       </span>
                       {references.map((ref, idx) => (
                          <div key={idx} className="flex items-center gap-3 bg-[var(--bg-surface)] border border-[var(--border-color)] px-3 py-1.5 rounded-lg">
                             <span className="text-xs font-bold text-slate-700">{ref.name}</span>
                             <div className="h-4 w-px bg-slate-200" />
                             <button 
                                onClick={() => navigator.clipboard.writeText(`${ref.name} (${ref.relationship} at ${ref.company || 'N/A'}) - Email: ${ref.email || 'N/A'}, Phone: ${ref.phone || 'N/A'}`)}
                                className="text-[10px] font-bold text-blue-600 hover:text-blue-700"
                             >
                                COPY ALL
                             </button>
                          </div>
                       ))}
                    </div>
                 </div>
              )}

              {/* Action Bar */}
              <div className="px-4 sm:px-8 py-6 bg-slate-900 text-white flex flex-col xl:flex-row items-center justify-between gap-6">
                <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-4 sm:gap-6">
                   <div className="flex flex-col items-center sm:items-start shrink-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Submission Link</span>
                      <a href={currentSubmission.job.url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-400 hover:underline flex items-center gap-1 mt-1">
                         Open Portal <ExternalLink size={14} />
                      </a>
                   </div>
                   <div className="hidden sm:block h-8 w-px bg-white/10 shrink-0" />
                   <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                      AI has optimized your bullet points for this specific role. Paste the tailored resume and cover letter into the application fields.
                   </p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full xl:w-auto">
                  <button 
                    onClick={() => setCurrentSubmission(null)}
                    className="px-6 py-3 border border-white/20 rounded-xl text-sm font-bold hover:bg-white/5 transition-all w-full sm:w-auto text-center"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => handleConfirmSubmission(currentSubmission.job.id)}
                    className="px-6 sm:px-8 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 flex flex-col sm:flex-row items-center justify-center gap-2 w-full sm:w-auto"
                  >
                    <span>Complete Submission</span>
                    <ArrowRight size={16} className="hidden sm:block" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
