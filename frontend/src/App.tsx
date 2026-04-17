import { useEffect, useMemo, useState } from 'react';

type Note = {
  id: string;
  body: string;
  createdAt: string;
};

type Activity = {
  id: string;
  type: string;
  description: string;
  createdAt: string;
};

type DebtItem = {
  id: string;
  creditorName: string;
  referenceNumber: string;
  debtType: string;
  classification: 'SECURED' | 'UNSECURED';
  balance: string;
  monthlyPayment: string;
};
type CreditorMasterItem = {
  id: string;
  name: string;
};
type LoanData = {
  initialLoanAmount: string;
  furtherAdvance: string;
  propertyValue: string;
  includeHirePurchase: 'yes' | 'no';
  includeSecuredLoans: 'yes' | 'no';
  notes: string;
};
type ClientDocumentItem = {
  id: string;
  clientId: string;
  section: string;
  originalName: string;
  storedName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  filePath: string;
  autoTag?: string | null;
  createdAt: string;
};
type ClientMetadata = {
  income?: Record<string, string>;
  expenditure?: Record<string, string>;
  debts?: DebtItem[];
  loan?: LoanData;
};

type Client = {
  id: string;
  title?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  mobile?: string | null;
  dob?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  county?: string | null;
  postcode?: string | null;
  status: string;
  source?: string | null;
  campaign?: string | null;
  createdAt: string;
  notes?: Note[];
  activities?: Activity[];
  metadataJson?: ClientMetadata | null;
};

type View = 'dashboard' | 'clients' | 'tasks' | 'reporting' | 'admin';
type ClientTab =
  | 'overview'
  | 'income'
  | 'expenditure'
  | 'summary'
  | 'debts'
  | 'loan'
  | 'documents'
  | 'notes'
  | 'activity';

const API_URL = 'https://tmac-crm-api.onrender.com';
const emptyDebtForm: DebtItem = {
  id: '',
  creditorName: '',
  referenceNumber: '',
  debtType: 'Credit Card',
  classification: 'UNSECURED',
  balance: '',
  monthlyPayment: '',
};
const emptyLoanData: LoanData = {
  initialLoanAmount: '',
  furtherAdvance: '',
  propertyValue: '',
  includeHirePurchase: 'no',
  includeSecuredLoans: 'no',
  notes: '',
};
const emptyClientForm = {
  title: '',
  firstName: '',
  lastName: '',
  email: '',
  mobile: '',
  dob: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  county: '',
  postcode: '',
  source: '',
  campaign: '',
  status: 'NEW_LEAD',
};

const emptyIncomeData: Record<string, string> = {
  clientSalary: '',
  partnerSalary: '',
  clientOvertime: '',
  partnerOvertime: '',
  clientBonus: '',
  partnerBonus: '',
  clientSelfEmployed: '',
  partnerSelfEmployed: '',
  universalCredit: '',
  childBenefit: '',
  workingTaxCredit: '',
  childTaxCredit: '',
  pip: '',
  dla: '',
  attendanceAllowance: '',
  carersAllowance: '',
  esa: '',
  jsa: '',
  housingBenefit: '',
  pensionCredit: '',
  statePension: '',
  maintenanceReceived: '',
  boardIncome: '',
  pensionIncome: '',
  rentalIncome: '',
  familySupport: '',
  otherIncome1: '',
  otherIncome2: '',
};
const debtTypeOptions = [
  'Mortgage',
  'Secured Loan',
  'Second Charge',
  'Bridging Loan',
  'Hire Purchase',
  'Credit Card',
  'Personal Loan',
  'Overdraft',
  'Store Card',
  'Catalogue',
  'Payday Loan',
  'Council Tax',
  'HMRC',
  'Student Loan',
  'Utility Arrears',
  'Rent Arrears',
  'Mobile / Telecom',
  'Benefit Overpayment',
  'Other Unsecured',
];

const defaultCreditorMasterList: CreditorMasterItem[] = [
  { id: 'cred_1', name: 'Barclays' },
  { id: 'cred_2', name: 'Lloyds Bank' },
  { id: 'cred_3', name: 'Halifax' },
  { id: 'cred_4', name: 'NatWest' },
  { id: 'cred_5', name: 'HSBC' },
  { id: 'cred_6', name: 'Santander' },
  { id: 'cred_7', name: 'Nationwide' },
  { id: 'cred_8', name: 'TSB' },
  { id: 'cred_9', name: 'Capital One' },
  { id: 'cred_10', name: 'MBNA' },
  { id: 'cred_11', name: 'Vanquis' },
  { id: 'cred_12', name: 'NewDay' },
  { id: 'cred_13', name: 'Tesco Bank' },
  { id: 'cred_14', name: 'Virgin Money' },
  { id: 'cred_15', name: 'Monzo' },
  { id: 'cred_16', name: 'Starling Bank' },
  { id: 'cred_17', name: 'HMRC' },
  { id: 'cred_18', name: 'Student Loans Company' },
  { id: 'cred_19', name: 'Local Council' },
  { id: 'cred_20', name: 'British Gas' },
  { id: 'cred_21', name: 'E.ON' },
  { id: 'cred_22', name: 'EDF Energy' },
  { id: 'cred_23', name: 'Octopus Energy' },
  { id: 'cred_24', name: 'Scottish Power' },
  { id: 'cred_25', name: 'Thames Water' },
  { id: 'cred_26', name: 'Anglian Water' },
  { id: 'cred_27', name: 'Severn Trent' },
  { id: 'cred_28', name: 'O2' },
  { id: 'cred_29', name: 'EE' },
  { id: 'cred_30', name: 'Vodafone' },
  { id: 'cred_31', name: 'Three' },
  { id: 'cred_32', name: 'Sky' },
  { id: 'cred_33', name: 'Virgin Media' },
  { id: 'cred_34', name: 'BT' },
  { id: 'cred_35', name: 'TalkTalk' },
  { id: 'cred_36', name: 'Kensington' },
  { id: 'cred_37', name: 'Together' },
  { id: 'cred_38', name: 'Pepper Money' },
  { id: 'cred_39', name: 'Precise Mortgages' },
  { id: 'cred_40', name: 'Aldermore' },
  { id: 'cred_41', name: 'Shawbrook' },
];

function defaultClassificationForDebtType(debtType: string) {
  const securedTypes = [
    'Mortgage',
    'Secured Loan',
    'Second Charge',
    'Bridging Loan',
    'Hire Purchase',
  ];

  return securedTypes.includes(debtType) ? 'SECURED' : 'UNSECURED';
}

function makeDebtId() {
  return `debt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function makeCreditorId() {
  return `creditor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
const emptyExpenditureData: Record<string, string> = {
  adults: '1',
  childrenUnder16: '0',
  children16to18: '0',
  housekeepingFood: '',
  housekeepingCleaning: '',
  housekeepingPets: '',
  housekeepingSchoolMeals: '',
  housekeepingOther: '',
  personalClothing: '',
  personalFootwear: '',
  personalHairdressing: '',
  personalToiletries: '',
  personalLaundry: '',
  personalOther: '',
  commsLandline: '',
  commsMobile: '',
  commsInternet: '',
  commsTvPackage: '',
  commsEntertainment: '',
  commsHobbies: '',
  commsPocketMoney: '',
  commsChildrenActivities: '',
  commsTrips: '',
  commsOther: '',
  mortgage: '',
  rent: '',
  securedLoan: '',
  councilTax: '',
  gas: '',
  electric: '',
  water: '',
  tvLicence: '',
  buildingsInsurance: '',
  contentsInsurance: '',
  lifeInsurance: '',
  healthInsurance: '',
  carInsurance: '',
  fuel: '',
  carTax: '',
  carMaintenance: '',
  motServicing: '',
  publicTransport: '',
  parkingTolls: '',
  childcare: '',
  schoolTransport: '',
  schoolUniforms: '',
  childMaintenancePaid: '',
  creditCards: '',
  loans: '',
  hpPcp: '',
  overdraft: '',
  storeCards: '',
  cataloguePayments: '',
  medical: '',
  dentalOptical: '',
  professionalFees: '',
  unionFees: '',
  otherEssential: '',
};

export default function App() {
  const [token, setToken] = useState<string>('');
  const [email, setEmail] = useState('admin@tmaccrm.local');
  const [password, setPassword] = useState('ChangeMe123!');
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [view, setView] = useState<View>('dashboard');
  const [search, setSearch] = useState('');
  const [showAddClient, setShowAddClient] = useState(false);
  const [clientForm, setClientForm] = useState(emptyClientForm);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
 const [clientTab, setClientTab] = useState<ClientTab>('overview');
const [editForm, setEditForm] = useState(emptyClientForm);
const [incomeForm, setIncomeForm] = useState<Record<string, string>>(emptyIncomeData);
const [expenditureForm, setExpenditureForm] = useState<Record<string, string>>(emptyExpenditureData);
const [debts, setDebts] = useState<DebtItem[]>([]);
const [debtForm, setDebtForm] = useState<DebtItem>(emptyDebtForm);
const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
const [loanForm, setLoanForm] = useState<LoanData>(emptyLoanData);
const [creditorSearch, setCreditorSearch] = useState('');
const [creditorMasterList, setCreditorMasterList] = useState<CreditorMasterItem[]>(() => {
  const saved = localStorage.getItem('tmac-creditor-master-list');
  return saved ? JSON.parse(saved) : defaultCreditorMasterList;
});
const [creditorAdminName, setCreditorAdminName] = useState('');
const [editingCreditorId, setEditingCreditorId] = useState<string | null>(null);
const [clientDocuments, setClientDocuments] = useState<ClientDocumentItem[]>([]);
const [uploadingSection, setUploadingSection] = useState<string | null>(null);
const [newNote, setNewNote] = useState('');

  const isLoggedIn = useMemo(() => Boolean(token), [token]);
useEffect(() => {
  localStorage.setItem('tmac-creditor-master-list', JSON.stringify(creditorMasterList));
}, [creditorMasterList]);
  const filteredClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return clients;

    return clients.filter((client) => {
      const haystack = [
        client.firstName,
        client.lastName,
        client.email || '',
        client.mobile || '',
        client.postcode || '',
        client.status || '',
        client.source || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [clients, search]);

  function money(value?: string) {
    const num = Number(value || 0);
    return Number.isFinite(num) ? num : 0;
  }
function calcSfsAllowance(
  firstAdult: number,
  additionalAdult: number,
  childUnder16: number,
  child16to18: number,
  adults: number,
  childrenUnder16: number,
  children16to18: number
) {
  const firstAdultValue = adults > 0 ? firstAdult : 0;
  const additionalAdultsValue = Math.max(adults - 1, 0) * additionalAdult;
  const under16Value = childrenUnder16 * childUnder16;
  const age16to18Value = children16to18 * child16to18;

  return firstAdultValue + additionalAdultsValue + under16Value + age16to18Value;
}

function getVarianceStatus(actual: number, allowed: number) {
  return actual <= allowed ? 'within' : 'over';
}
  function sumFields(source: Record<string, string>, fields: string[]) {
    return fields.reduce((acc, key) => acc + money(source[key]), 0);
  }

  const totalIncome = useMemo(() => {
    return sumFields(incomeForm, Object.keys(emptyIncomeData));
  }, [incomeForm]);

  const totalHousekeeping = useMemo(() => {
    return sumFields(expenditureForm, [
      'housekeepingFood',
      'housekeepingCleaning',
      'housekeepingPets',
      'housekeepingSchoolMeals',
      'housekeepingOther',
    ]);
  }, [expenditureForm]);

  const totalPersonal = useMemo(() => {
    return sumFields(expenditureForm, [
      'personalClothing',
      'personalFootwear',
      'personalHairdressing',
      'personalToiletries',
      'personalLaundry',
      'personalOther',
    ]);
  }, [expenditureForm]);

  const totalComms = useMemo(() => {
    return sumFields(expenditureForm, [
      'commsLandline',
      'commsMobile',
      'commsInternet',
      'commsTvPackage',
      'commsEntertainment',
      'commsHobbies',
      'commsPocketMoney',
      'commsChildrenActivities',
      'commsTrips',
      'commsOther',
    ]);
  }, [expenditureForm]);
const adultsCount = Math.max(Number(expenditureForm.adults || 1), 1);
const childrenUnder16Count = Math.max(Number(expenditureForm.childrenUnder16 || 0), 0);
const children16to18Count = Math.max(Number(expenditureForm.children16to18 || 0), 0);

const housekeepingAllowance = useMemo(() => {
  return calcSfsAllowance(454, 333, 197, 235, adultsCount, childrenUnder16Count, children16to18Count);
}, [adultsCount, childrenUnder16Count, children16to18Count]);

const personalAllowance = useMemo(() => {
  return calcSfsAllowance(95, 67, 47, 105, adultsCount, childrenUnder16Count, children16to18Count);
}, [adultsCount, childrenUnder16Count, children16to18Count]);

const commsAllowance = useMemo(() => {
  return calcSfsAllowance(250, 179, 87, 140, adultsCount, childrenUnder16Count, children16to18Count);
}, [adultsCount, childrenUnder16Count, children16to18Count]);

const housekeepingVariance = housekeepingAllowance - totalHousekeeping;
const personalVariance = personalAllowance - totalPersonal;
const commsVariance = commsAllowance - totalComms;
  const totalFixedExpenditure = useMemo(() => {
    return sumFields(expenditureForm, [
      'mortgage',
      'rent',
      'securedLoan',
      'councilTax',
      'gas',
      'electric',
      'water',
      'tvLicence',
      'buildingsInsurance',
      'contentsInsurance',
      'lifeInsurance',
      'healthInsurance',
      'carInsurance',
      'fuel',
      'carTax',
      'carMaintenance',
      'motServicing',
      'publicTransport',
      'parkingTolls',
      'childcare',
      'schoolTransport',
      'schoolUniforms',
      'childMaintenancePaid',
      'creditCards',
      'loans',
      'hpPcp',
      'overdraft',
      'storeCards',
      'cataloguePayments',
      'medical',
      'dentalOptical',
      'professionalFees',
      'unionFees',
      'otherEssential',
    ]);
  }, [expenditureForm]);
const totalSecuredDebt = useMemo(() => {
  return debts
    .filter((debt) => debt.classification === 'SECURED')
    .reduce((acc, debt) => acc + money(debt.balance), 0);
}, [debts]);

const totalUnsecuredDebt = useMemo(() => {
  return debts
    .filter((debt) => debt.classification === 'UNSECURED')
    .reduce((acc, debt) => acc + money(debt.balance), 0);
}, [debts]);

const totalDebt = totalSecuredDebt + totalUnsecuredDebt;
  const mortgageBalance = useMemo(() => {
  return debts
    .filter((debt) => debt.debtType === 'Mortgage')
    .reduce((acc, debt) => acc + money(debt.balance), 0);
}, [debts]);

const securedLoanBalance = useMemo(() => {
  return debts
    .filter((debt) =>
      ['Secured Loan', 'Second Charge', 'Bridging Loan'].includes(debt.debtType)
    )
    .reduce((acc, debt) => acc + money(debt.balance), 0);
}, [debts]);

const hirePurchaseBalance = useMemo(() => {
  return debts
    .filter((debt) => debt.debtType === 'Hire Purchase')
    .reduce((acc, debt) => acc + money(debt.balance), 0);
}, [debts]);

const propertyValueNumber = money(loanForm.propertyValue);
const furtherAdvanceNumber = money(loanForm.furtherAdvance);
const initialLoanAmountNumber = money(loanForm.initialLoanAmount);
const includedHpAmount = loanForm.includeHirePurchase === 'yes' ? hirePurchaseBalance : 0;
const includedSecuredLoanAmount =
  loanForm.includeSecuredLoans === 'yes' ? securedLoanBalance : 0;

const finalLoanAmount =
  totalUnsecuredDebt + furtherAdvanceNumber + includedHpAmount + includedSecuredLoanAmount;

const totalExistingSecuredBalances = mortgageBalance + securedLoanBalance;
const securedBalancesRemainingOutsideNewLoan =
  mortgageBalance + (loanForm.includeSecuredLoans === 'yes' ? 0 : securedLoanBalance);

const totalSecuredBorrowingAfterCompletion =
  securedBalancesRemainingOutsideNewLoan + finalLoanAmount;

const postCompletionLtv =
  propertyValueNumber > 0
    ? (totalSecuredBorrowingAfterCompletion / propertyValueNumber) * 100
    : 0;

function maxLoanAtLtv(targetLtv: number) {
  if (!propertyValueNumber) return 0;
  return Math.max((propertyValueNumber * targetLtv) / 100 - totalExistingSecuredBalances, 0);
}
  const totalExpenditure = totalHousekeeping + totalPersonal + totalComms + totalFixedExpenditure;
  const disposableIncome = totalIncome - totalExpenditure;

  async function login() {
    setError('');
    setSuccess('');

    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      setError('Login failed. Please check your email and password.');
      return;
    }

    const data = await response.json();
    setToken(data.token);
    await loadClients(data.token);
    setView('dashboard');
  }

  async function loadClients(activeToken = token) {
    const response = await fetch(`${API_URL}/clients`, {
      headers: { Authorization: `Bearer ${activeToken}` },
    });

    if (!response.ok) {
      setError('Could not load clients.');
      return;
    }

    const data = await response.json();
    setClients(data);

    if (selectedClientId) {
      await loadClientDetail(selectedClientId, activeToken);
    }
  }

  async function loadClientDetail(id: string, activeToken = token) {
    const response = await fetch(`${API_URL}/clients/${id}`, {
      headers: { Authorization: `Bearer ${activeToken}` },
    });

    if (!response.ok) {
      setError('Could not load client details.');
      return;
    }

    const data = await response.json();
    setSelectedClient(data);
    setSelectedClientId(id);
    setClientTab('overview');
    populateClientWorkspace(data);
  }

  function toDateInputValue(value?: string | null) {
    if (!value) return '';
    return new Date(value).toISOString().split('T')[0];
  }

  function populateClientWorkspace(client: Client) {
    setEditForm({
      title: client.title || '',
      firstName: client.firstName || '',
      lastName: client.lastName || '',
      email: client.email || '',
      mobile: client.mobile || '',
      dob: toDateInputValue(client.dob),
      addressLine1: client.addressLine1 || '',
      addressLine2: client.addressLine2 || '',
      city: client.city || '',
      county: client.county || '',
      postcode: client.postcode || '',
      source: client.source || '',
      campaign: client.campaign || '',
      status: client.status || 'NEW_LEAD',
    });

    setIncomeForm({
      ...emptyIncomeData,
      ...(client.metadataJson?.income || {}),
    });

    setExpenditureForm({
      ...emptyExpenditureData,
      ...(client.metadataJson?.expenditure || {}),
    });
    setDebts(client.metadataJson?.debts || []);
setDebtForm(emptyDebtForm);
setEditingDebtId(null);
setLoanForm({
  ...emptyLoanData,
  ...(client.metadataJson?.loan || {}),
});
setCreditorSearch('');
  }

  async function openClient(client: Client) {
    setShowAddClient(false);
    setSuccess('');
    setError('');
    await loadClientDetail(client.id);
    await loadClientDocuments(client.id);
  }

  function closeClientRecord() {
    setSelectedClientId(null);
    setSelectedClient(null);
    setClientTab('overview');
    setNewNote('');
    setSuccess('');
    setError('');
  }

  async function createClient() {
    setError('');
    setSuccess('');

    const response = await fetch(`${API_URL}/clients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(clientForm),
    });

    if (!response.ok) {
      setError('Could not create client.');
      return;
    }

    setClientForm(emptyClientForm);
    setShowAddClient(false);
    await loadClients();
    setView('clients');
    setSuccess('Client created successfully.');
  }

  async function saveClientChanges() {
    if (!selectedClientId) return;

    setError('');
    setSuccess('');

    const response = await fetch(`${API_URL}/clients/${selectedClientId}`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    ...editForm,
   metadataJson: {
  income: incomeForm,
  expenditure: expenditureForm,
  debts,
  loan: loanForm,
},
  }),
});

    if (!response.ok) {
    setError('Could not update client.');
    return;
  }

  await loadClients();
  await loadClientDetail(selectedClientId);
  setSuccess('Client updated successfully.');
}

  async function addNote() {
    if (!selectedClientId || !newNote.trim()) return;

    setError('');
    setSuccess('');

    const response = await fetch(`${API_URL}/clients/${selectedClientId}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ body: newNote }),
    });

    if (!response.ok) {
      setError('Could not add note.');
      return;
    }

    setNewNote('');
    await loadClientDetail(selectedClientId);
    setSuccess('Note added successfully.');
  }

  async function deleteClient(id: string, fullName: string) {
    const confirmed = window.confirm(`Delete ${fullName}? This cannot be undone.`);
    if (!confirmed) return;

    const response = await fetch(`${API_URL}/clients/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      setError('Could not delete client.');
      return;
    }

    closeClientRecord();
    await loadClients();
    setSuccess('Client deleted successfully.');
  }

  function updateClientForm(field: keyof typeof emptyClientForm, value: string) {
    setClientForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateEditForm(field: keyof typeof emptyClientForm, value: string) {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateIncomeForm(field: string, value: string) {
    setIncomeForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateExpenditureForm(field: string, value: string) {
    setExpenditureForm((prev) => ({ ...prev, [field]: value }));
  }
function updateDebtForm(field: keyof DebtItem, value: string) {
  setDebtForm((prev) => {
    const next = { ...prev, [field]: value };

    if (field === 'debtType') {
      next.classification = defaultClassificationForDebtType(value);
    }

    return next;
  });
}

function updateLoanForm(field: keyof LoanData, value: string) {
  setLoanForm((prev) => ({ ...prev, [field]: value }));
}

function resetDebtForm() {
  setDebtForm(emptyDebtForm);
  setEditingDebtId(null);
  setCreditorSearch('');
}

function addOrUpdateDebt() {
  if (!debtForm.creditorName.trim()) {
    setError('Please enter a creditor name.');
    return;
  }

  setError('');

  if (editingDebtId) {
    setDebts((prev) =>
      prev.map((debt) =>
        debt.id === editingDebtId
          ? {
              ...debtForm,
              id: editingDebtId,
            }
          : debt
      )
    );
    setSuccess('Debt updated. Click Save changes to keep it on the client record.');
  } else {
    const item: DebtItem = {
      ...debtForm,
      id: makeDebtId(),
    };

    setDebts((prev) => [...prev, item]);
    setSuccess('Debt added. Click Save changes to keep it on the client record.');
  }

  resetDebtForm();
}

function editDebt(debt: DebtItem) {
  setDebtForm(debt);
  setEditingDebtId(debt.id);
  setCreditorSearch(debt.creditorName);
  setSuccess('');
  setError('');
}

function removeDebt(id: string) {
  setDebts((prev) => prev.filter((debt) => debt.id !== id));

  if (editingDebtId === id) {
    resetDebtForm();
  }
}
  function resetCreditorAdminForm() {
  setCreditorAdminName('');
  setEditingCreditorId(null);
}

function addOrUpdateCreditor() {
  if (!creditorAdminName.trim()) {
    setError('Please enter a creditor name.');
    return;
  }

  setError('');

  if (editingCreditorId) {
    setCreditorMasterList((prev) =>
      prev.map((item) =>
        item.id === editingCreditorId ? { ...item, name: creditorAdminName.trim() } : item
      )
    );
    setSuccess('Creditor updated successfully.');
  } else {
    setCreditorMasterList((prev) => [
      ...prev,
      { id: makeCreditorId(), name: creditorAdminName.trim() },
    ]);
    setSuccess('Creditor added successfully.');
  }

  resetCreditorAdminForm();
}

function editCreditor(item: CreditorMasterItem) {
  setCreditorAdminName(item.name);
  setEditingCreditorId(item.id);
  setSuccess('');
  setError('');
}

function deleteCreditor(id: string) {
  setCreditorMasterList((prev) => prev.filter((item) => item.id !== id));

  if (editingCreditorId === id) {
    resetCreditorAdminForm();
  }

  setSuccess('Creditor removed successfully.');
}

async function loadClientDocuments(clientId: string) {
  const response = await fetch(`${API_URL}/clients/${clientId}/documents`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) return;

  const data = await response.json();
  setClientDocuments(data);
}
async function uploadClientDocument(section: string, file: File) {
  if (!selectedClientId) return;

  setUploadingSection(section);
  setError('');
  setSuccess('');

  const formData = new FormData();
  formData.append('file', file);
  formData.append('section', section);

  const response = await fetch(`${API_URL}/clients/${selectedClientId}/documents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  setUploadingSection(null);

  if (!response.ok) {
    setError('Could not upload document.');
    return;
  }

  await loadClientDocuments(selectedClientId);
  setSuccess('Document uploaded successfully.');
}

async function deleteClientDocument(documentId: string) {
  if (!selectedClientId) return;

  const response = await fetch(
    `${API_URL}/clients/${selectedClientId}/documents/${documentId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
async function downloadClientDocument(documentId: string, originalName: string) {
  if (!selectedClientId) return;

  const response = await fetch(
    `${API_URL}/clients/${selectedClientId}/documents/${documentId}/download`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    setError('Could not download document.');
    return;
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = originalName;

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.URL.revokeObjectURL(url);
}
  if (!response.ok) {
    setError('Could not delete document.');
    return;
  }

  await loadClientDocuments(selectedClientId);
  setSuccess('Document deleted successfully.');
}

  function formatDate(value: string) {
    return new Date(value).toLocaleDateString('en-GB');
  }

  function formatDateTime(value: string) {
    return new Date(value).toLocaleString('en-GB');
  }

  function formatDob(value?: string | null) {
    if (!value) return 'Not set';
    return new Date(value).toLocaleDateString('en-GB');
  }

  function renderDashboard() {
    const now = new Date();

    const todayCount = clients.filter((client) => {
      const d = new Date(client.createdAt);
      return d.toDateString() === now.toDateString();
    }).length;
    const addedThisWeek = clients.filter((client) => {
  const created = new Date(client.createdAt);
  const now = new Date();

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  return created >= startOfWeek;
}).length;

    const thisMonthCount = clients.filter((client) => {
      const d = new Date(client.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    const thisYearCount = clients.filter((client) => {
      const d = new Date(client.createdAt);
      return d.getFullYear() === now.getFullYear();
    }).length;

    const statusCounts = [
      { label: 'New Leads', value: clients.filter((c) => c.status === 'NEW_LEAD').length },
      { label: 'Qualified', value: clients.filter((c) => c.status === 'QUALIFIED').length },
      { label: 'Submitted', value: clients.filter((c) => c.status === 'SUBMITTED').length },
      { label: 'Approved', value: clients.filter((c) => c.status === 'APPROVED').length },
      { label: 'Completed', value: clients.filter((c) => c.status === 'COMPLETED').length },
      { label: 'Lost', value: clients.filter((c) => c.status === 'LOST').length },
    ];

    return (
      <>
        <header className="page-header premium-header">
          <div>
            <div className="eyebrow">Management Information</div>
            <h2>Dashboard</h2>
            <p>Daily operational snapshot for TMAC CRM.</p>
          </div>
          <div className="header-actions">
            <button className="secondary" onClick={() => loadClients()}>
              Refresh data
            </button>
            <button
              className="primary"
              onClick={() => {
                setShowAddClient(true);
                setSelectedClientId(null);
                setSelectedClient(null);
                setView('clients');
              }}
            >
              Add client
            </button>
          </div>
        </header>

        <div className="dashboard-hero">
  <div className="dashboard-metric">
    <span>Leads today</span>
    <strong>{todayCount}</strong>
  </div>

  <div className="dashboard-metric">
    <span>Leads this week</span>
    <strong>{addedThisWeek}</strong>
  </div>

  <div className="dashboard-metric">
    <span>Leads this month</span>
    <strong>{thisMonthCount}</strong>
  </div>

  <div className="dashboard-metric highlight">
    <span>Total leads</span>
    <strong>{clients.length}</strong>
  </div>
</div>
<div className="dashboard-performance">
  <div className="performance-card">
    <span>New leads in pipeline</span>
    <strong>{clients.filter(c => c.status === 'NEW_LEAD').length}</strong>
  </div>

  <div className="performance-card">
    <span>Qualified in pipeline</span>
    <strong>{clients.filter(c => c.status === 'QUALIFIED').length}</strong>
  </div>

  <div className="performance-card">
    <span>Submitted in pipeline</span>
    <strong>{clients.filter(c => c.status === 'SUBMITTED').length}</strong>
  </div>

  <div className="performance-card">
    <span>Completed in pipeline</span>
    <strong>{clients.filter(c => c.status === 'COMPLETED').length}</strong>
  </div>
</div>
        <section className="dashboard-premium-grid">
          <section className="card dashboard-panel premium-panel">
            <div className="table-header dashboard-section-header">
  <div>
    <h3>Status snapshot</h3>
    <span>Current pipeline overview</span>
  </div>
</div>

            <div className="status-grid premium-status-grid">
              {statusCounts.map((item) => (
                <div key={item.label} className="status-box premium-status-box">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="card dashboard-panel premium-panel">
            <div className="table-header dashboard-section-header">
  <div>
    <h3>Recent clients</h3>
    <span>Latest additions to the CRM</span>
  </div>
</div>

            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Email</th>
                  <th>Date Added</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No clients yet.</td>
                  </tr>
                ) : (
                  clients.slice(0, 8).map((client) => (
                    <tr key={client.id}>
                      <td><strong>{client.firstName} {client.lastName}</strong></td>
                      <td><span className="pill">{client.status.replaceAll('_', ' ')}</span></td>
                      <td>{client.email || '-'}</td>
                      <td>{formatDate(client.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </section>
      </>
    );
  }

  function renderClientList() {
    return (
      <>
        <header className="page-header premium-header">
          <div>
            <div className="eyebrow">Client Management</div>
            <h2>Clients</h2>
            <p>View and manage client records.</p>
          </div>
          <div className="header-actions">
            <button className="secondary" onClick={() => loadClients()}>
              Refresh list
            </button>
            <button
              className="primary"
              onClick={() => {
                setShowAddClient((prev) => !prev);
                setSuccess('');
                setError('');
              }}
            >
              {showAddClient ? 'Close form' : 'Add client'}
            </button>
          </div>
        </header>

        {showAddClient && (
          <section className="card form-card premium-panel">
            <div className="table-header">
              <h3>Add client</h3>
            </div>

            <div className="form-grid">
              <div>
  <label>Title</label>
  <select
    value={clientForm.title}
    onChange={(e) => updateClientForm('title', e.target.value)}
  >
    <option value="">Select title</option>
    <option value="Mr">Mr</option>
    <option value="Mrs">Mrs</option>
    <option value="Miss">Miss</option>
    <option value="Ms">Ms</option>
    <option value="Dr">Dr</option>
    <option value="Mx">Mx</option>
    <option value="Other">Other</option>
  </select>
</div>
              <div>
                <label>First name</label>
                <input value={clientForm.firstName} onChange={(e) => updateClientForm('firstName', e.target.value)} />
              </div>
              <div>
                <label>Last name</label>
                <input value={clientForm.lastName} onChange={(e) => updateClientForm('lastName', e.target.value)} />
              </div>
              <div>
                <label>Email</label>
                <input value={clientForm.email} onChange={(e) => updateClientForm('email', e.target.value)} />
              </div>
              <div>
                <label>Mobile</label>
                <input value={clientForm.mobile} onChange={(e) => updateClientForm('mobile', e.target.value)} />
              </div>
              <div>
                <label>Date of birth</label>
                <input type="date" value={clientForm.dob} onChange={(e) => updateClientForm('dob', e.target.value)} />
              </div>
              <div>
                <label>Status</label>
                <select value={clientForm.status} onChange={(e) => updateClientForm('status', e.target.value)}>
                  <option value="NEW_LEAD">New Lead</option>
                  <option value="CONTACT_ATTEMPTED">Contact Attempted</option>
                  <option value="QUALIFIED">Qualified</option>
                  <option value="DOCS_REQUESTED">Docs Requested</option>
                  <option value="DOCS_RECEIVED">Docs Received</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="APPROVED">Approved</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="LOST">Lost</option>
                </select>
              </div>
              <div className="full-width">
                <label>Address line 1</label>
                <input value={clientForm.addressLine1} onChange={(e) => updateClientForm('addressLine1', e.target.value)} />
              </div>
              <div className="full-width">
                <label>Address line 2</label>
                <input value={clientForm.addressLine2} onChange={(e) => updateClientForm('addressLine2', e.target.value)} />
              </div>
              <div>
                <label>City / Town</label>
                <input value={clientForm.city} onChange={(e) => updateClientForm('city', e.target.value)} />
              </div>
              <div>
                <label>County</label>
                <input value={clientForm.county} onChange={(e) => updateClientForm('county', e.target.value)} />
              </div>
              <div>
                <label>Postcode</label>
                <input value={clientForm.postcode} onChange={(e) => updateClientForm('postcode', e.target.value)} />
              </div>
              <div>
                <label>Source</label>
                <input value={clientForm.source} onChange={(e) => updateClientForm('source', e.target.value)} />
              </div>
              <div>
                <label>Campaign</label>
                <input value={clientForm.campaign} onChange={(e) => updateClientForm('campaign', e.target.value)} />
              </div>
            </div>

            <div className="form-actions">
              <button className="secondary" onClick={() => setClientForm(emptyClientForm)}>
                Clear
              </button>
              <button className="primary" onClick={createClient}>
                Save client
              </button>
            </div>
          </section>
        )}

        <section className="card table-card premium-panel">
          <div className="table-header">
            <h3>Client list</h3>
            <div className="table-tools">
              <input
                className="search-input"
                placeholder="Search by name, email, mobile or postcode"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span>{filteredClients.length} records</span>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Mobile</th>
                <th>Postcode</th>
                <th>Status</th>
                <th>Date Added</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={6}>No clients found.</td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  <tr key={client.id} className="clickable-row" onClick={() => openClient(client)}>
                    <td><strong>{client.title ? `${client.title} ` : ''}{client.firstName} {client.lastName}</strong></td>
                    <td>{client.email || '-'}</td>
                    <td>{client.mobile || '-'}</td>
                    <td>{client.postcode || '-'}</td>
                    <td><span className="pill">{client.status.replaceAll('_', ' ')}</span></td>
                    <td>{formatDate(client.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </>
    );
  }

  function renderOverviewTab() {
    if (!selectedClient) return null;

    return (
      <section className="card form-card polished-panel premium-panel">
        <div className="client-header premium-client-header">
          <div>
            <div className="client-title-row">
              <h3>{selectedClient.title ? `${selectedClient.title} ` : ''}{selectedClient.firstName} {selectedClient.lastName}</h3>
              <span className="pill">{editForm.status.replaceAll('_', ' ')}</span>
            </div>

            <div className="client-meta-grid">
              <div>
                <span className="meta-label">Date added</span>
                <strong>{formatDate(selectedClient.createdAt)}</strong>
              </div>
              <div>
                <span className="meta-label">Date of birth</span>
                <strong>{formatDob(selectedClient.dob)}</strong>
              </div>
              <div>
                <span className="meta-label">Email</span>
                <strong>{selectedClient.email || '-'}</strong>
              </div>
              <div>
                <span className="meta-label">Mobile</span>
                <strong>{selectedClient.mobile || '-'}</strong>
              </div>
            </div>
          </div>

          <div className="client-header-actions">
            <button className="secondary" onClick={closeClientRecord}>
              Back to client list
            </button>
            <button className="secondary" onClick={() => populateClientWorkspace(selectedClient)}>
              Reset
            </button>
            <button className="primary" onClick={saveClientChanges}>
              Save changes
            </button>
            <button
              className="danger-button"
              onClick={() => deleteClient(selectedClient.id, `${selectedClient.firstName} ${selectedClient.lastName}`)}
            >
              Delete
            </button>
          </div>
        </div>

        <div className="detail-sections">
          <section className="detail-section">
            <h4>Personal details</h4>
            <div className="form-grid">
              <div>
  <label>Title</label>
  <select
    value={editForm.title}
    onChange={(e) => updateEditForm('title', e.target.value)}
  >
    <option value="">Select title</option>
    <option value="Mr">Mr</option>
    <option value="Mrs">Mrs</option>
    <option value="Miss">Miss</option>
    <option value="Ms">Ms</option>
    <option value="Dr">Dr</option>
    <option value="Mx">Mx</option>
    <option value="Other">Other</option>
  </select>
</div>
              <div>
                <label>First name</label>
                <input value={editForm.firstName} onChange={(e) => updateEditForm('firstName', e.target.value)} />
              </div>
              <div>
                <label>Last name</label>
                <input value={editForm.lastName} onChange={(e) => updateEditForm('lastName', e.target.value)} />
              </div>
              <div>
                <label>Email</label>
                <input value={editForm.email} onChange={(e) => updateEditForm('email', e.target.value)} />
              </div>
              <div>
                <label>Mobile</label>
                <input value={editForm.mobile} onChange={(e) => updateEditForm('mobile', e.target.value)} />
              </div>
              <div>
                <label>Date of birth</label>
                <input type="date" value={editForm.dob} onChange={(e) => updateEditForm('dob', e.target.value)} />
              </div>
              <div>
                <label>Status</label>
                <select value={editForm.status} onChange={(e) => updateEditForm('status', e.target.value)}>
                  <option value="NEW_LEAD">New Lead</option>
                  <option value="CONTACT_ATTEMPTED">Contact Attempted</option>
                  <option value="QUALIFIED">Qualified</option>
                  <option value="DOCS_REQUESTED">Docs Requested</option>
                  <option value="DOCS_RECEIVED">Docs Received</option>
                  <option value="SUBMITTED">Submitted</option>
                  <option value="APPROVED">Approved</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="LOST">Lost</option>
                </select>
              </div>
            </div>
          </section>

          <section className="detail-section">
            <h4>Address</h4>
            <div className="form-grid">
              <div className="full-width">
                <label>Address line 1</label>
                <input value={editForm.addressLine1} onChange={(e) => updateEditForm('addressLine1', e.target.value)} />
              </div>
              <div className="full-width">
                <label>Address line 2</label>
                <input value={editForm.addressLine2} onChange={(e) => updateEditForm('addressLine2', e.target.value)} />
              </div>
              <div>
                <label>City / Town</label>
                <input value={editForm.city} onChange={(e) => updateEditForm('city', e.target.value)} />
              </div>
              <div>
                <label>County</label>
                <input value={editForm.county} onChange={(e) => updateEditForm('county', e.target.value)} />
              </div>
              <div>
                <label>Postcode</label>
                <input value={editForm.postcode} onChange={(e) => updateEditForm('postcode', e.target.value)} />
              </div>
            </div>
          </section>

          <section className="detail-section">
            <h4>Case details</h4>
            <div className="form-grid">
              <div>
                <label>Source</label>
                <input value={editForm.source} onChange={(e) => updateEditForm('source', e.target.value)} />
              </div>
              <div>
                <label>Campaign</label>
                <input value={editForm.campaign} onChange={(e) => updateEditForm('campaign', e.target.value)} />
              </div>
            </div>
          </section>
        </div>
      </section>
    );
  }

  function renderIncomeTab() {
    return (
      <section className="card premium-panel tab-panel">
        <div className="detail-sections">
          <section className="detail-section">
            <h4>Employment income</h4>
            <div className="form-grid">
              <div><label>Client salary</label><input value={incomeForm.clientSalary} onChange={(e) => updateIncomeForm('clientSalary', e.target.value)} /></div>
              <div><label>Partner salary</label><input value={incomeForm.partnerSalary} onChange={(e) => updateIncomeForm('partnerSalary', e.target.value)} /></div>
              <div><label>Client overtime</label><input value={incomeForm.clientOvertime} onChange={(e) => updateIncomeForm('clientOvertime', e.target.value)} /></div>
              <div><label>Partner overtime</label><input value={incomeForm.partnerOvertime} onChange={(e) => updateIncomeForm('partnerOvertime', e.target.value)} /></div>
              <div><label>Client bonus / commission</label><input value={incomeForm.clientBonus} onChange={(e) => updateIncomeForm('clientBonus', e.target.value)} /></div>
              <div><label>Partner bonus / commission</label><input value={incomeForm.partnerBonus} onChange={(e) => updateIncomeForm('partnerBonus', e.target.value)} /></div>
              <div><label>Client self-employed</label><input value={incomeForm.clientSelfEmployed} onChange={(e) => updateIncomeForm('clientSelfEmployed', e.target.value)} /></div>
              <div><label>Partner self-employed</label><input value={incomeForm.partnerSelfEmployed} onChange={(e) => updateIncomeForm('partnerSelfEmployed', e.target.value)} /></div>
            </div>
          </section>

          <section className="detail-section">
            <h4>Benefits</h4>
            <div className="form-grid">
              <div><label>Universal Credit</label><input value={incomeForm.universalCredit} onChange={(e) => updateIncomeForm('universalCredit', e.target.value)} /></div>
              <div><label>Child Benefit</label><input value={incomeForm.childBenefit} onChange={(e) => updateIncomeForm('childBenefit', e.target.value)} /></div>
              <div><label>Working Tax Credit</label><input value={incomeForm.workingTaxCredit} onChange={(e) => updateIncomeForm('workingTaxCredit', e.target.value)} /></div>
              <div><label>Child Tax Credit</label><input value={incomeForm.childTaxCredit} onChange={(e) => updateIncomeForm('childTaxCredit', e.target.value)} /></div>
              <div><label>PIP</label><input value={incomeForm.pip} onChange={(e) => updateIncomeForm('pip', e.target.value)} /></div>
              <div><label>DLA</label><input value={incomeForm.dla} onChange={(e) => updateIncomeForm('dla', e.target.value)} /></div>
              <div><label>Attendance Allowance</label><input value={incomeForm.attendanceAllowance} onChange={(e) => updateIncomeForm('attendanceAllowance', e.target.value)} /></div>
              <div><label>Carer’s Allowance</label><input value={incomeForm.carersAllowance} onChange={(e) => updateIncomeForm('carersAllowance', e.target.value)} /></div>
              <div><label>ESA</label><input value={incomeForm.esa} onChange={(e) => updateIncomeForm('esa', e.target.value)} /></div>
              <div><label>JSA</label><input value={incomeForm.jsa} onChange={(e) => updateIncomeForm('jsa', e.target.value)} /></div>
              <div><label>Housing Benefit</label><input value={incomeForm.housingBenefit} onChange={(e) => updateIncomeForm('housingBenefit', e.target.value)} /></div>
              <div><label>Pension Credit</label><input value={incomeForm.pensionCredit} onChange={(e) => updateIncomeForm('pensionCredit', e.target.value)} /></div>
              <div><label>State Pension</label><input value={incomeForm.statePension} onChange={(e) => updateIncomeForm('statePension', e.target.value)} /></div>
            </div>
          </section>

          <section className="detail-section">
            <h4>Other income</h4>
            <div className="form-grid">
              <div><label>Maintenance received</label><input value={incomeForm.maintenanceReceived} onChange={(e) => updateIncomeForm('maintenanceReceived', e.target.value)} /></div>
              <div><label>Board / lodger income</label><input value={incomeForm.boardIncome} onChange={(e) => updateIncomeForm('boardIncome', e.target.value)} /></div>
              <div><label>Pension income</label><input value={incomeForm.pensionIncome} onChange={(e) => updateIncomeForm('pensionIncome', e.target.value)} /></div>
              <div><label>Rental income</label><input value={incomeForm.rentalIncome} onChange={(e) => updateIncomeForm('rentalIncome', e.target.value)} /></div>
              <div><label>Family support</label><input value={incomeForm.familySupport} onChange={(e) => updateIncomeForm('familySupport', e.target.value)} /></div>
              <div><label>Other income 1</label><input value={incomeForm.otherIncome1} onChange={(e) => updateIncomeForm('otherIncome1', e.target.value)} /></div>
              <div><label>Other income 2</label><input value={incomeForm.otherIncome2} onChange={(e) => updateIncomeForm('otherIncome2', e.target.value)} /></div>
            </div>
          </section>
        </div>
      </section>
    );
  }

function renderExpenditureTab() {
  return (
    <section className="card premium-panel tab-panel">
      <div className="detail-sections">
        <section className="detail-section">
          <h4>Household setup</h4>
          <div className="form-grid">
            <div>
              <label>Adults</label>
              <select
                value={expenditureForm.adults}
                onChange={(e) => updateExpenditureForm('adults', e.target.value)}
              >
                {[1, 2, 3, 4, 5, 6].map((num) => (
                  <option key={num} value={String(num)}>
                    {num}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Children under 16</label>
              <select
                value={expenditureForm.childrenUnder16}
                onChange={(e) => updateExpenditureForm('childrenUnder16', e.target.value)}
              >
                {[0, 1, 2, 3, 4, 5, 6].map((num) => (
                  <option key={num} value={String(num)}>
                    {num}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Children 16-18</label>
              <select
                value={expenditureForm.children16to18}
                onChange={(e) => updateExpenditureForm('children16to18', e.target.value)}
              >
                {[0, 1, 2, 3, 4, 5, 6].map((num) => (
                  <option key={num} value={String(num)}>
                    {num}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="detail-section">
          <h4>SFS guideline snapshot</h4>

          <div className="sfs-grid">
            <div className={`sfs-card ${getVarianceStatus(totalHousekeeping, housekeepingAllowance)}`}>
              <div className="sfs-card-top">
                <span className="sfs-card-title">Housekeeping</span>
                <span
                  className={`sfs-status-pill ${
                    getVarianceStatus(totalHousekeeping, housekeepingAllowance) === 'within'
                      ? 'within'
                      : 'over'
                  }`}
                >
                  {getVarianceStatus(totalHousekeeping, housekeepingAllowance) === 'within'
                    ? 'Within Guideline'
                    : 'Over Guideline'}
                </span>
              </div>

              <div className="sfs-figure-row">
                <div>
                  <label>Actual</label>
                  <strong>£{totalHousekeeping.toFixed(2)}</strong>
                </div>
                <div>
                  <label>Allowed</label>
                  <strong>£{housekeepingAllowance.toFixed(2)}</strong>
                </div>
              </div>

              <div className="sfs-variance-row">
                Variance:
                <span className={housekeepingVariance >= 0 ? 'variance-good' : 'variance-bad'}>
                  {housekeepingVariance >= 0 ? '+' : '-'}£{Math.abs(housekeepingVariance).toFixed(2)}
                </span>
              </div>
            </div>

            <div className={`sfs-card ${getVarianceStatus(totalPersonal, personalAllowance)}`}>
              <div className="sfs-card-top">
                <span className="sfs-card-title">Personal</span>
                <span
                  className={`sfs-status-pill ${
                    getVarianceStatus(totalPersonal, personalAllowance) === 'within'
                      ? 'within'
                      : 'over'
                  }`}
                >
                  {getVarianceStatus(totalPersonal, personalAllowance) === 'within'
                    ? 'Within Guideline'
                    : 'Over Guideline'}
                </span>
              </div>

              <div className="sfs-figure-row">
                <div>
                  <label>Actual</label>
                  <strong>£{totalPersonal.toFixed(2)}</strong>
                </div>
                <div>
                  <label>Allowed</label>
                  <strong>£{personalAllowance.toFixed(2)}</strong>
                </div>
              </div>

              <div className="sfs-variance-row">
                Variance:
                <span className={personalVariance >= 0 ? 'variance-good' : 'variance-bad'}>
                  {personalVariance >= 0 ? '+' : '-'}£{Math.abs(personalVariance).toFixed(2)}
                </span>
              </div>
            </div>

            <div className={`sfs-card ${getVarianceStatus(totalComms, commsAllowance)}`}>
              <div className="sfs-card-top">
                <span className="sfs-card-title">Comms & Leisure</span>
                <span
                  className={`sfs-status-pill ${
                    getVarianceStatus(totalComms, commsAllowance) === 'within'
                      ? 'within'
                      : 'over'
                  }`}
                >
                  {getVarianceStatus(totalComms, commsAllowance) === 'within'
                    ? 'Within Guideline'
                    : 'Over Guideline'}
                </span>
              </div>

              <div className="sfs-figure-row">
                <div>
                  <label>Actual</label>
                  <strong>£{totalComms.toFixed(2)}</strong>
                </div>
                <div>
                  <label>Allowed</label>
                  <strong>£{commsAllowance.toFixed(2)}</strong>
                </div>
              </div>

              <div className="sfs-variance-row">
                Variance:
                <span className={commsVariance >= 0 ? 'variance-good' : 'variance-bad'}>
                  {commsVariance >= 0 ? '+' : '-'}£{Math.abs(commsVariance).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="detail-section">
          <h4>SFS Housekeeping</h4>
          <div className="form-grid">
            <div><label>Food</label><input value={expenditureForm.housekeepingFood} onChange={(e) => updateExpenditureForm('housekeepingFood', e.target.value)} /></div>
            <div><label>Cleaning</label><input value={expenditureForm.housekeepingCleaning} onChange={(e) => updateExpenditureForm('housekeepingCleaning', e.target.value)} /></div>
            <div><label>Pets</label><input value={expenditureForm.housekeepingPets} onChange={(e) => updateExpenditureForm('housekeepingPets', e.target.value)} /></div>
            <div><label>School meals</label><input value={expenditureForm.housekeepingSchoolMeals} onChange={(e) => updateExpenditureForm('housekeepingSchoolMeals', e.target.value)} /></div>
            <div><label>Other housekeeping</label><input value={expenditureForm.housekeepingOther} onChange={(e) => updateExpenditureForm('housekeepingOther', e.target.value)} /></div>
          </div>
        </section>

        <section className="detail-section">
          <h4>SFS Personal</h4>
          <div className="form-grid">
            <div><label>Clothing</label><input value={expenditureForm.personalClothing} onChange={(e) => updateExpenditureForm('personalClothing', e.target.value)} /></div>
            <div><label>Footwear</label><input value={expenditureForm.personalFootwear} onChange={(e) => updateExpenditureForm('personalFootwear', e.target.value)} /></div>
            <div><label>Hairdressing</label><input value={expenditureForm.personalHairdressing} onChange={(e) => updateExpenditureForm('personalHairdressing', e.target.value)} /></div>
            <div><label>Toiletries</label><input value={expenditureForm.personalToiletries} onChange={(e) => updateExpenditureForm('personalToiletries', e.target.value)} /></div>
            <div><label>Laundry</label><input value={expenditureForm.personalLaundry} onChange={(e) => updateExpenditureForm('personalLaundry', e.target.value)} /></div>
            <div><label>Other personal</label><input value={expenditureForm.personalOther} onChange={(e) => updateExpenditureForm('personalOther', e.target.value)} /></div>
          </div>
        </section>

        <section className="detail-section">
          <h4>SFS Comms & Leisure</h4>
          <div className="form-grid">
            <div><label>Landline</label><input value={expenditureForm.commsLandline} onChange={(e) => updateExpenditureForm('commsLandline', e.target.value)} /></div>
            <div><label>Mobile</label><input value={expenditureForm.commsMobile} onChange={(e) => updateExpenditureForm('commsMobile', e.target.value)} /></div>
            <div><label>Internet</label><input value={expenditureForm.commsInternet} onChange={(e) => updateExpenditureForm('commsInternet', e.target.value)} /></div>
            <div><label>TV package / Sky</label><input value={expenditureForm.commsTvPackage} onChange={(e) => updateExpenditureForm('commsTvPackage', e.target.value)} /></div>
            <div><label>Entertainment</label><input value={expenditureForm.commsEntertainment} onChange={(e) => updateExpenditureForm('commsEntertainment', e.target.value)} /></div>
            <div><label>Hobbies</label><input value={expenditureForm.commsHobbies} onChange={(e) => updateExpenditureForm('commsHobbies', e.target.value)} /></div>
            <div><label>Pocket money</label><input value={expenditureForm.commsPocketMoney} onChange={(e) => updateExpenditureForm('commsPocketMoney', e.target.value)} /></div>
            <div><label>Children’s activities</label><input value={expenditureForm.commsChildrenActivities} onChange={(e) => updateExpenditureForm('commsChildrenActivities', e.target.value)} /></div>
            <div><label>Trips / days out</label><input value={expenditureForm.commsTrips} onChange={(e) => updateExpenditureForm('commsTrips', e.target.value)} /></div>
            <div><label>Other comms & leisure</label><input value={expenditureForm.commsOther} onChange={(e) => updateExpenditureForm('commsOther', e.target.value)} /></div>
          </div>
        </section>

        <section className="detail-section">
          <h4>Fixed / Non-SFS expenditure</h4>

          <div className="sub-section">
            <h5>Housing</h5>
            <div className="form-grid">
              <div><label>Mortgage</label><input value={expenditureForm.mortgage} onChange={(e) => updateExpenditureForm('mortgage', e.target.value)} /></div>
              <div><label>Rent</label><input value={expenditureForm.rent} onChange={(e) => updateExpenditureForm('rent', e.target.value)} /></div>
              <div><label>Secured loan</label><input value={expenditureForm.securedLoan} onChange={(e) => updateExpenditureForm('securedLoan', e.target.value)} /></div>
              <div><label>Council tax</label><input value={expenditureForm.councilTax} onChange={(e) => updateExpenditureForm('councilTax', e.target.value)} /></div>
            </div>
          </div>

          <div className="sub-section">
            <h5>Utilities & Bills</h5>
            <div className="form-grid">
              <div><label>Gas</label><input value={expenditureForm.gas} onChange={(e) => updateExpenditureForm('gas', e.target.value)} /></div>
              <div><label>Electric</label><input value={expenditureForm.electric} onChange={(e) => updateExpenditureForm('electric', e.target.value)} /></div>
              <div><label>Water</label><input value={expenditureForm.water} onChange={(e) => updateExpenditureForm('water', e.target.value)} /></div>
              <div><label>TV licence</label><input value={expenditureForm.tvLicence} onChange={(e) => updateExpenditureForm('tvLicence', e.target.value)} /></div>
            </div>
          </div>

          <div className="sub-section">
            <h5>Insurance (excluding car)</h5>
            <div className="form-grid">
              <div><label>Buildings insurance</label><input value={expenditureForm.buildingsInsurance} onChange={(e) => updateExpenditureForm('buildingsInsurance', e.target.value)} /></div>
              <div><label>Contents insurance</label><input value={expenditureForm.contentsInsurance} onChange={(e) => updateExpenditureForm('contentsInsurance', e.target.value)} /></div>
              <div><label>Life insurance</label><input value={expenditureForm.lifeInsurance} onChange={(e) => updateExpenditureForm('lifeInsurance', e.target.value)} /></div>
              <div><label>Health insurance</label><input value={expenditureForm.healthInsurance} onChange={(e) => updateExpenditureForm('healthInsurance', e.target.value)} /></div>
            </div>
          </div>

          <div className="sub-section">
            <h5>Vehicle Costs</h5>
            <div className="form-grid">
              <div><label>Car insurance</label><input value={expenditureForm.carInsurance} onChange={(e) => updateExpenditureForm('carInsurance', e.target.value)} /></div>
              <div><label>Fuel</label><input value={expenditureForm.fuel} onChange={(e) => updateExpenditureForm('fuel', e.target.value)} /></div>
              <div><label>Car tax</label><input value={expenditureForm.carTax} onChange={(e) => updateExpenditureForm('carTax', e.target.value)} /></div>
              <div><label>Maintenance</label><input value={expenditureForm.carMaintenance} onChange={(e) => updateExpenditureForm('carMaintenance', e.target.value)} /></div>
              <div><label>MOT / servicing</label><input value={expenditureForm.motServicing} onChange={(e) => updateExpenditureForm('motServicing', e.target.value)} /></div>
              <div><label>Parking / tolls</label><input value={expenditureForm.parkingTolls} onChange={(e) => updateExpenditureForm('parkingTolls', e.target.value)} /></div>
              <div><label>Public transport</label><input value={expenditureForm.publicTransport} onChange={(e) => updateExpenditureForm('publicTransport', e.target.value)} /></div>
            </div>
          </div>

          <div className="sub-section">
            <h5>Children & Family</h5>
            <div className="form-grid">
              <div><label>Childcare</label><input value={expenditureForm.childcare} onChange={(e) => updateExpenditureForm('childcare', e.target.value)} /></div>
              <div><label>School transport</label><input value={expenditureForm.schoolTransport} onChange={(e) => updateExpenditureForm('schoolTransport', e.target.value)} /></div>
              <div><label>School uniforms</label><input value={expenditureForm.schoolUniforms} onChange={(e) => updateExpenditureForm('schoolUniforms', e.target.value)} /></div>
              <div><label>Child maintenance paid</label><input value={expenditureForm.childMaintenancePaid} onChange={(e) => updateExpenditureForm('childMaintenancePaid', e.target.value)} /></div>
            </div>
          </div>

          <div className="sub-section">
            <h5>Credit Commitments</h5>
            <div className="form-grid">
              <div><label>Credit cards</label><input value={expenditureForm.creditCards} onChange={(e) => updateExpenditureForm('creditCards', e.target.value)} /></div>
              <div><label>Loans</label><input value={expenditureForm.loans} onChange={(e) => updateExpenditureForm('loans', e.target.value)} /></div>
              <div><label>HP / PCP</label><input value={expenditureForm.hpPcp} onChange={(e) => updateExpenditureForm('hpPcp', e.target.value)} /></div>
              <div><label>Overdraft</label><input value={expenditureForm.overdraft} onChange={(e) => updateExpenditureForm('overdraft', e.target.value)} /></div>
              <div><label>Store cards</label><input value={expenditureForm.storeCards} onChange={(e) => updateExpenditureForm('storeCards', e.target.value)} /></div>
              <div><label>Catalogue payments</label><input value={expenditureForm.cataloguePayments} onChange={(e) => updateExpenditureForm('cataloguePayments', e.target.value)} /></div>
            </div>
          </div>

          <div className="sub-section">
            <h5>Other Essentials</h5>
            <div className="form-grid">
              <div><label>Medical</label><input value={expenditureForm.medical} onChange={(e) => updateExpenditureForm('medical', e.target.value)} /></div>
              <div><label>Dental / optical</label><input value={expenditureForm.dentalOptical} onChange={(e) => updateExpenditureForm('dentalOptical', e.target.value)} /></div>
              <div><label>Professional fees</label><input value={expenditureForm.professionalFees} onChange={(e) => updateExpenditureForm('professionalFees', e.target.value)} /></div>
              <div><label>Union fees</label><input value={expenditureForm.unionFees} onChange={(e) => updateExpenditureForm('unionFees', e.target.value)} /></div>
              <div><label>Other essential</label><input value={expenditureForm.otherEssential} onChange={(e) => updateExpenditureForm('otherEssential', e.target.value)} /></div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
function renderSummaryTab() {
  return (
    <section className="card premium-panel tab-panel">
      <div className="summary-grid">
        <div className="summary-box">
          <span>Total income</span>
          <strong>£{totalIncome.toFixed(2)}</strong>
        </div>
        <div className="summary-box">
          <span>Total SFS expenditure</span>
          <strong>£{(totalHousekeeping + totalPersonal + totalComms).toFixed(2)}</strong>
        </div>
        <div className="summary-box">
          <span>Fixed expenditure</span>
          <strong>£{totalFixedExpenditure.toFixed(2)}</strong>
        </div>
        <div className="summary-box">
          <span>Total expenditure</span>
          <strong>£{totalExpenditure.toFixed(2)}</strong>
        </div>
        <div className="summary-box highlight">
          <span>Disposable income</span>
          <strong>£{disposableIncome.toFixed(2)}</strong>
        </div>
      </div>

      <section className="detail-section summary-section">
        <h4>SFS comparison</h4>

        <div className="sfs-grid">
          <div className={`sfs-card ${getVarianceStatus(totalHousekeeping, housekeepingAllowance)}`}>
            <div className="sfs-card-top">
              <span className="sfs-card-title">Housekeeping</span>
              <span
                className={`sfs-status-pill ${
                  getVarianceStatus(totalHousekeeping, housekeepingAllowance) === 'within'
                    ? 'within'
                    : 'over'
                }`}
              >
                {getVarianceStatus(totalHousekeeping, housekeepingAllowance) === 'within'
                  ? 'Within Guideline'
                  : 'Over Guideline'}
              </span>
            </div>

            <div className="sfs-figure-row">
              <div>
                <label>Actual</label>
                <strong>£{totalHousekeeping.toFixed(2)}</strong>
              </div>
              <div>
                <label>Allowed</label>
                <strong>£{housekeepingAllowance.toFixed(2)}</strong>
              </div>
            </div>

            <div className="sfs-variance-row">
              Variance:
              <span className={housekeepingVariance >= 0 ? 'variance-good' : 'variance-bad'}>
                {housekeepingVariance >= 0 ? '+' : '-'}£{Math.abs(housekeepingVariance).toFixed(2)}
              </span>
            </div>
          </div>

          <div className={`sfs-card ${getVarianceStatus(totalPersonal, personalAllowance)}`}>
            <div className="sfs-card-top">
              <span className="sfs-card-title">Personal</span>
              <span
                className={`sfs-status-pill ${
                  getVarianceStatus(totalPersonal, personalAllowance) === 'within'
                    ? 'within'
                    : 'over'
                }`}
              >
                {getVarianceStatus(totalPersonal, personalAllowance) === 'within'
                  ? 'Within Guideline'
                  : 'Over Guideline'}
              </span>
            </div>

            <div className="sfs-figure-row">
              <div>
                <label>Actual</label>
                <strong>£{totalPersonal.toFixed(2)}</strong>
              </div>
              <div>
                <label>Allowed</label>
                <strong>£{personalAllowance.toFixed(2)}</strong>
              </div>
            </div>

            <div className="sfs-variance-row">
              Variance:
              <span className={personalVariance >= 0 ? 'variance-good' : 'variance-bad'}>
                {personalVariance >= 0 ? '+' : '-'}£{Math.abs(personalVariance).toFixed(2)}
              </span>
            </div>
          </div>

          <div className={`sfs-card ${getVarianceStatus(totalComms, commsAllowance)}`}>
            <div className="sfs-card-top">
              <span className="sfs-card-title">Comms & Leisure</span>
              <span
                className={`sfs-status-pill ${
                  getVarianceStatus(totalComms, commsAllowance) === 'within'
                    ? 'within'
                    : 'over'
                }`}
              >
                {getVarianceStatus(totalComms, commsAllowance) === 'within'
                  ? 'Within Guideline'
                  : 'Over Guideline'}
              </span>
            </div>

            <div className="sfs-figure-row">
              <div>
                <label>Actual</label>
                <strong>£{totalComms.toFixed(2)}</strong>
              </div>
              <div>
                <label>Allowed</label>
                <strong>£{commsAllowance.toFixed(2)}</strong>
              </div>
            </div>

            <div className="sfs-variance-row">
              Variance:
              <span className={commsVariance >= 0 ? 'variance-good' : 'variance-bad'}>
                {commsVariance >= 0 ? '+' : '-'}£{Math.abs(commsVariance).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
 function renderDebtsTab() {
  const filteredCreditors = creditorMasterList.filter((item) =>
  item.name.toLowerCase().includes(creditorSearch.toLowerCase())
);

  const securedDebts = debts.filter((debt) => debt.classification === 'SECURED');
  const unsecuredDebts = debts.filter((debt) => debt.classification === 'UNSECURED');

  const securedMonthlyPayment = securedDebts.reduce(
    (acc, debt) => acc + money(debt.monthlyPayment),
    0
  );

  const unsecuredMonthlyPayment = unsecuredDebts.reduce(
    (acc, debt) => acc + money(debt.monthlyPayment),
    0
  );

  return (
    <section className="card premium-panel tab-panel">
      <div className="summary-grid">
        <div className="summary-box">
          <span>Total secured debt</span>
          <strong>£{totalSecuredDebt.toFixed(2)}</strong>
        </div>
        <div className="summary-box">
          <span>Total unsecured debt</span>
          <strong>£{totalUnsecuredDebt.toFixed(2)}</strong>
        </div>
        <div className="summary-box highlight">
          <span>Total debt</span>
          <strong>£{totalDebt.toFixed(2)}</strong>
        </div>
        <div className="summary-box">
          <span>Number of debts</span>
          <strong>{debts.length}</strong>
        </div>
      </div>

      <div className="detail-sections">
        <section className="detail-section">
          <div className="table-header">
            <h4>{editingDebtId ? 'Edit debt / creditor' : 'Add debt / creditor'}</h4>
            {editingDebtId && (
              <button className="secondary" onClick={resetDebtForm}>
                Cancel edit
              </button>
            )}
          </div>

          <div className="form-grid">
            <div className="full-width">
              <label>Creditor search</label>
              <input
                value={creditorSearch}
                onChange={(e) => {
                  setCreditorSearch(e.target.value);
                  updateDebtForm('creditorName', e.target.value);
                }}
                placeholder="Start typing creditor name"
              />
              {creditorSearch.trim() && filteredCreditors.length > 0 && (
                <div className="creditor-suggestions">
              {filteredCreditors.slice(0, 8).map((item) => (
  <button
    key={item.id}
    type="button"
    className="creditor-suggestion"
    onClick={() => {
      setCreditorSearch(item.name);
      updateDebtForm('creditorName', item.name);
    }}
  >
    {item.name}
  </button>
))}
                </div>
              )}
            </div>

            <div>
              <label>Creditor name</label>
              <input
                value={debtForm.creditorName}
                onChange={(e) => updateDebtForm('creditorName', e.target.value)}
              />
            </div>

            <div>
              <label>Reference number</label>
              <input
                value={debtForm.referenceNumber}
                onChange={(e) => updateDebtForm('referenceNumber', e.target.value)}
              />
            </div>

            <div>
              <label>Debt type</label>
              <select
                value={debtForm.debtType}
                onChange={(e) => updateDebtForm('debtType', e.target.value)}
              >
                {debtTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Secured / Unsecured</label>
              <select
                value={debtForm.classification}
                onChange={(e) =>
                  updateDebtForm('classification', e.target.value as 'SECURED' | 'UNSECURED')
                }
              >
                <option value="SECURED">Secured</option>
                <option value="UNSECURED">Unsecured</option>
              </select>
            </div>

            <div>
              <label>Balance</label>
              <input
                value={debtForm.balance}
                onChange={(e) => updateDebtForm('balance', e.target.value)}
              />
            </div>

            <div>
              <label>Monthly payment</label>
              <input
                value={debtForm.monthlyPayment}
                onChange={(e) => updateDebtForm('monthlyPayment', e.target.value)}
              />
            </div>
          </div>

          <div className="form-actions">
            <button className="secondary" onClick={resetDebtForm}>
              Clear
            </button>
            <button className="primary" onClick={addOrUpdateDebt}>
              {editingDebtId ? 'Update debt' : 'Add debt'}
            </button>
          </div>
        </section>

        <section className="detail-section">
          <div className="debt-section-header">
            <div>
              <h4>Secured debts</h4>
              <p className="muted-text">
                {securedDebts.length} items · Monthly payments £{securedMonthlyPayment.toFixed(2)}
              </p>
            </div>
            <div className="debt-section-total">£{totalSecuredDebt.toFixed(2)}</div>
          </div>

          {securedDebts.length === 0 ? (
            <p className="muted-text">No secured debts added yet.</p>
          ) : (
            <div className="debt-list">
              {securedDebts.map((debt) => (
                <div key={debt.id} className="debt-item">
                  <div className="debt-main">
                    <strong>{debt.creditorName}</strong>
                    <span>{debt.debtType}</span>
                    <span>Ref: {debt.referenceNumber || '-'}</span>
                  </div>
                  <div className="debt-figures">
                    <span>Balance £{money(debt.balance).toFixed(2)}</span>
                    <span>Payment £{money(debt.monthlyPayment).toFixed(2)}</span>
                  </div>
<div className="debt-actions">
  <button
    className="secondary small-button"
    onClick={() => editDebt(debt)}
  >
    Edit
  </button>

  <button
    className="danger-button small-button"
    onClick={() => removeDebt(debt.id)}
  >
    Remove
  </button>
</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="detail-section">
          <div className="debt-section-header">
            <div>
              <h4>Unsecured debts</h4>
              <p className="muted-text">
                {unsecuredDebts.length} items · Monthly payments £{unsecuredMonthlyPayment.toFixed(2)}
              </p>
            </div>
            <div className="debt-section-total">£{totalUnsecuredDebt.toFixed(2)}</div>
          </div>

          {unsecuredDebts.length === 0 ? (
            <p className="muted-text">No unsecured debts added yet.</p>
          ) : (
            <div className="debt-list">
              {unsecuredDebts.map((debt) => (
                <div key={debt.id} className="debt-item">
                  <div className="debt-main">
                    <strong>{debt.creditorName}</strong>
                    <span>{debt.debtType}</span>
                    <span>Ref: {debt.referenceNumber || '-'}</span>
                  </div>
                  <div className="debt-figures">
                    <span>Balance £{money(debt.balance).toFixed(2)}</span>
                    <span>Payment £{money(debt.monthlyPayment).toFixed(2)}</span>
                  </div>
                  <div className="debt-actions">
                    <button className="secondary small-button" onClick={() => editDebt(debt)}>
                      Edit
                    </button>
                    <button
                      className="danger-button small-button"
                      onClick={() => removeDebt(debt.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
 function renderLoanTab() {
  return (
    <section className="card premium-panel tab-panel">
      <div className="loan-hero">
  <div className="loan-hero-main">
    <span className="loan-hero-label">Deal amount</span>
    <strong>£{finalLoanAmount.toFixed(0)}</strong>
    <small>
      Built from unsecured debts, further advance, and any included secured loans / HP.
    </small>
  </div>

  <div className="loan-hero-metrics">
    <div className="loan-hero-card">
      <span>Post LTV</span>
      <strong className={postCompletionLtv > 85 ? 'danger' : 'safe'}>
        {postCompletionLtv.toFixed(2)}%
      </strong>
    </div>

    <div className="loan-hero-card">
      <span>Total secured after completion</span>
      <strong>£{totalSecuredBorrowingAfterCompletion.toFixed(0)}</strong>
    </div>

    <div className="loan-hero-card emphasis">
      <span>Disposable income</span>
      <strong>£{disposableIncome.toFixed(0)}</strong>
    </div>
  </div>
</div>

      <div className="detail-sections">
        <section className="detail-section">
  <h4>Loan build</h4>

  <div className="loan-build-panel">
    <div className="loan-build-left">
      <div className="loan-line">
        <span>Unsecured debts</span>
        <strong>£{totalUnsecuredDebt.toFixed(0)}</strong>
      </div>

      <div className="loan-line">
        <span>Further advance</span>
        <strong>£{furtherAdvanceNumber.toFixed(0)}</strong>
      </div>

      <div className="loan-line">
        <span>Secured loans included</span>
        <strong>£{includedSecuredLoanAmount.toFixed(0)}</strong>
      </div>

      <div className="loan-line">
        <span>Hire purchase included</span>
        <strong>£{includedHpAmount.toFixed(0)}</strong>
      </div>

      <div className="loan-total">
        <span>Total loan</span>
        <strong>£{finalLoanAmount.toFixed(0)}</strong>
      </div>
    </div>

    <div className="loan-build-right">
      <div>
        <label>Initial loan amount</label>
        <input
          value={loanForm.initialLoanAmount}
          onChange={(e) => updateLoanForm('initialLoanAmount', e.target.value)}
          placeholder="For later API / lead source use"
        />
      </div>

      <div>
        <label>Further advance</label>
        <input
          value={loanForm.furtherAdvance}
          onChange={(e) => updateLoanForm('furtherAdvance', e.target.value)}
        />
      </div>

      <div>
        <label>Final loan amount</label>
        <input value={finalLoanAmount.toFixed(0)} readOnly />
      </div>
    </div>
  </div>
</section>

        <section className="detail-section">
  <h4>Security position</h4>

  <div className="security-panel">
    <div className="security-grid">
      <div className="security-card editable">
        <label>Property value</label>
        <input
          value={loanForm.propertyValue}
          onChange={(e) => updateLoanForm('propertyValue', e.target.value)}
        />
      </div>

      <div className="security-card">
        <span>Mortgage</span>
        <strong>£{mortgageBalance.toFixed(0)}</strong>
      </div>

      <div className="security-card">
        <span>Secured loans</span>
        <strong>£{securedLoanBalance.toFixed(0)}</strong>
      </div>

      <div className="security-card">
        <span>Hire purchase</span>
        <strong>£{hirePurchaseBalance.toFixed(0)}</strong>
      </div>
    </div>

    <div className="loan-decisions premium-decisions">
      {hirePurchaseBalance > 0 && (
        <div className="decision-row">
          <div>
            <strong>Hire purchase</strong>
            <p>Decide whether HP should be rolled into the final raise.</p>
          </div>
          <select
            value={loanForm.includeHirePurchase}
            onChange={(e) => updateLoanForm('includeHirePurchase', e.target.value)}
          >
            <option value="no">Do not include</option>
            <option value="yes">Include in loan</option>
          </select>
        </div>
      )}

      {securedLoanBalance > 0 && (
        <div className="decision-row">
          <div>
            <strong>Secured loans</strong>
            <p>Decide whether existing secured loans should be refinanced.</p>
          </div>
          <select
            value={loanForm.includeSecuredLoans}
            onChange={(e) => updateLoanForm('includeSecuredLoans', e.target.value)}
          >
            <option value="no">Do not refinance</option>
            <option value="yes">Refinance into loan</option>
          </select>
        </div>
      )}
    </div>
  </div>
</section>
        <section className="detail-section">
          <h4>LTV and lending headroom</h4>

          <div className="summary-grid">
            <div className="summary-box">
              <span>Total existing secured balances</span>
              <strong>£{totalExistingSecuredBalances.toFixed(0)}</strong>
            </div>

            <div className="summary-box">
              <span>Secured balances remaining outside new loan</span>
              <strong>£{securedBalancesRemainingOutsideNewLoan.toFixed(0)}</strong>
            </div>

            <div className="summary-box">
              <span>Total secured after completion</span>
              <strong>£{totalSecuredBorrowingAfterCompletion.toFixed(0)}</strong>
            </div>

            <div className="summary-box highlight">
              <span>Post-completion LTV</span>
              <strong>{postCompletionLtv.toFixed(2)}%</strong>
            </div>
          </div>

          <div className="ltv-grid">
            {[100, 95, 90, 85, 80, 75].map((ltv) => (
              <div key={ltv} className="ltv-card">
                <span>{ltv}% LTV max loan</span>
                <strong>£{maxLoanAtLtv(ltv).toFixed(0)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="detail-section">
          <h4>Advisor notes</h4>
          <textarea
            className="loan-notes-area"
            value={loanForm.notes}
            onChange={(e) => updateLoanForm('notes', e.target.value)}
            placeholder="Case observations, lender fit, affordability comments, exit notes, property notes, etc."
            rows={5}
          />
        </section>

        <section className="detail-section">
          <h4>Useful case MI</h4>

          <div className="summary-grid">
            <div className="summary-box">
              <span>Total household income</span>
              <strong>£{totalIncome.toFixed(0)}</strong>
            </div>

            <div className="summary-box">
              <span>Total expenditure</span>
              <strong>£{totalExpenditure.toFixed(0)}</strong>
            </div>

            <div className="summary-box highlight">
              <span>Disposable income</span>
              <strong>£{disposableIncome.toFixed(0)}</strong>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
function renderDocumentsTab() {
  const sections = [
    'Proof of ID',
    'Proof of Address',
    'Proof of Income',
    'Other Documents',
  ];

  return (
    <section className="card premium-panel tab-panel">
      <h3>Client Documents</h3>

      <div className="documents-grid">
        {sections.map((section) => {
          const docs = clientDocuments.filter((doc) => doc.section === section);

          return (
            <div key={section} className="document-card">
              <div className="document-card-header">
                <h4>{section}</h4>
                <span>{docs.length} files</span>
              </div>

              <label className="document-upload">
                <input
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void uploadClientDocument(section, file);
                    }
                  }}
                />
                <div className="upload-placeholder">
                  <span>
                    {uploadingSection === section ? 'Uploading...' : 'Drag & drop or upload file'}
                  </span>
                  <small>PDF, JPG, PNG, DOC, DOCX supported</small>
                </div>
              </label>

              <div className="document-list">
                {docs.length === 0 ? (
                  <p className="muted-text">No files uploaded yet.</p>
                ) : (
                  docs.map((doc) => (
                    <div key={doc.id} className="document-list-item">
                      <div className="document-meta">
                        <strong>{doc.originalName}</strong>
                        <small>
                          {doc.autoTag ? `${doc.autoTag} · ` : ''}
                          {doc.sizeBytes ? `${Math.round(doc.sizeBytes / 1024)} KB · ` : ''}
                          {new Date(doc.createdAt).toLocaleDateString('en-GB')}
                        </small>
                      </div>

                      <div className="document-actions">
  <button
    className="secondary small-button"
    
  >
    Download
  </button>

  <button
    className="danger-button small-button"
    onClick={() => void deleteClientDocument(doc.id)}
  >
    Delete
  </button>
</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
function renderNotesTab() {
  if (!selectedClient) return null;

  const notes = selectedClient.notes || [];

  return (
    <section className="card timeline-panel premium-panel">
      <div className="table-header">
        <h3>Notes</h3>
        <span>{notes.length} entries</span>
      </div>

      <div className="note-entry-box">
        <label>Add note</label>
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a note to the client record"
          rows={4}
        />
        <div className="form-actions">
          <button className="primary" onClick={addNote}>
            Save note
          </button>
        </div>
      </div>

      <div className="timeline-list">
        {notes.length === 0 ? (
          <p className="muted-text">No notes yet.</p>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="timeline-item note">
              <div className="timeline-dot" />
              <div className="timeline-content">
                <div className="timeline-head">
                  <strong>Internal note</strong>
                  <span>{formatDateTime(note.createdAt)}</span>
                </div>
                <p>{note.body}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
  function renderActivityTab() {
    if (!selectedClient) return null;

    const activities = selectedClient.activities || [];

    return (
      <section className="card compact-activity-panel premium-panel">
        <div className="table-header">
          <h3>Activity</h3>
          <span>{activities.length} entries</span>
        </div>

        <div className="compact-activity-list">
          {activities.length === 0 ? (
            <p className="muted-text">No activity yet.</p>
          ) : (
            activities.map((activity) => (
              <div key={activity.id} className="compact-activity-item">
                <div className="compact-activity-type">{activity.type.replaceAll('_', ' ')}</div>
                <div className="compact-activity-description">{activity.description}</div>
                <div className="compact-activity-time">{formatDateTime(activity.createdAt)}</div>
              </div>
            ))
          )}
        </div>
      </section>
    );
  }

  function renderClientRecord() {
    if (!selectedClient) return null;

    return (
      <>
        <header className="page-header premium-header">
          <div>
            <div className="eyebrow">Client Record</div>
            <h2>{selectedClient.title ? `${selectedClient.title} ` : ''}{selectedClient.firstName} {selectedClient.lastName}</h2>
            <p>Full client workspace and case file.</p>
          </div>
          <div className="header-actions">
            <button className="secondary" onClick={closeClientRecord}>
              Back to client list
            </button>
            <button className="primary" onClick={saveClientChanges}>
              Save changes
            </button>
          </div>
        </header>

        <section className="card client-record-shell premium-panel">
          <div className="client-tabs">
            {[
              ['overview', 'Overview'],
              ['income', 'Income'],
              ['expenditure', 'Expenditure'],
              ['summary', 'I&E + Disposable Income'],
              ['debts', 'Debts / Creditors'],
              ['loan', 'Loan'],
              ['documents', 'Documents'],
              ['notes', 'Notes'],
              ['activity', 'Activity'],
            ].map(([key, label]) => (
              <button
                key={key}
                className={`client-tab ${clientTab === key ? 'active' : ''}`}
                onClick={() => setClientTab(key as ClientTab)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="client-tab-content">
            {clientTab === 'overview' && renderOverviewTab()}
            {clientTab === 'income' && renderIncomeTab()}
            {clientTab === 'expenditure' && renderExpenditureTab()}
            {clientTab === 'summary' && renderSummaryTab()}
            {clientTab === 'debts' && renderDebtsTab()}
            {clientTab === 'loan' && renderLoanTab()}
            {clientTab === 'documents' && renderDocumentsTab()}
            {clientTab === 'notes' && renderNotesTab()}
            {clientTab === 'activity' && renderActivityTab()}
          </div>
        </section>
      </>
    );
  }

 function renderAdminTab() {
  const sortedCreditors = [...creditorMasterList].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return (
    <>
      <header className="page-header premium-header">
        <div>
          <div className="eyebrow">Administration</div>
          <h2>Creditor Master List</h2>
          <p>Manage the creditor list used in the debts and creditors tab.</p>
        </div>
      </header>

      <section className="card premium-panel tab-panel">
        <div className="detail-sections">
          <section className="detail-section">
            <div className="table-header">
              <h4>{editingCreditorId ? 'Edit creditor' : 'Add creditor'}</h4>
              {editingCreditorId && (
                <button className="secondary" onClick={resetCreditorAdminForm}>
                  Cancel edit
                </button>
              )}
            </div>

            <div className="form-grid">
              <div className="full-width">
                <label>Creditor name</label>
                <input
                  value={creditorAdminName}
                  onChange={(e) => setCreditorAdminName(e.target.value)}
                  placeholder="Enter creditor name"
                />
              </div>
            </div>

            <div className="form-actions">
              <button className="secondary" onClick={resetCreditorAdminForm}>
                Clear
              </button>
              <button className="primary" onClick={addOrUpdateCreditor}>
                {editingCreditorId ? 'Update creditor' : 'Add creditor'}
              </button>
            </div>
          </section>

          <section className="detail-section">
            <div className="table-header">
              <h4>Master creditor list</h4>
              <span>{sortedCreditors.length} creditors</span>
            </div>

            <div className="creditor-admin-list">
              {sortedCreditors.map((item) => (
                <div key={item.id} className="creditor-admin-item">
                  <strong>{item.name}</strong>
                  <div className="debt-actions">
                    <button className="secondary small-button" onClick={() => editCreditor(item)}>
                      Edit
                    </button>
                    <button
                      className="danger-button small-button"
                      onClick={() => deleteCreditor(item.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </>
  );
 }

function renderPlaceholder(title: string) {
  return (
    <section className="card placeholder-card premium-panel">
      <h2>{title}</h2>
      <p>This section is next to be built out.</p>
    </section>
  );
}

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.png" alt="TMAC CRM" className="logo" />
          <div>
            <div className="eyebrow">The Money Advice Centre</div>
            <h1>TMAC CRM</h1>
          </div>
        </div>

        <nav className="nav">
          <button className={`nav-item ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>
            Dashboard
          </button>
          <button className={`nav-item ${view === 'clients' ? 'active' : ''}`} onClick={() => setView('clients')}>
            Clients
          </button>
          <button className={`nav-item ${view === 'tasks' ? 'active' : ''}`} onClick={() => setView('tasks')}>
            Tasks
          </button>
          <button className={`nav-item ${view === 'reporting' ? 'active' : ''}`} onClick={() => setView('reporting')}>
            Reporting
          </button>
          <button className={`nav-item ${view === 'admin' ? 'active' : ''}`} onClick={() => setView('admin')}>
            Admin
          </button>

          {isLoggedIn && (
            <button
              className="nav-item logout-item"
              onClick={() => {
                setToken('');
                setClients([]);
                setSelectedClientId(null);
                setSelectedClient(null);
                setView('dashboard');
                setError('');
                setSuccess('');
              }}
            >
              Log out
            </button>
          )}
        </nav>
      </aside>

      <main className="content">
  {!isLoggedIn ? (
    <section className="card login-card premium-panel">
      <h2>Secure Login</h2>
      <p>Sign in to TMAC CRM</p>
      <label>Email</label>
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <label>Password</label>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="primary" onClick={login}>
        Log in
      </button>
      {error && <p className="error">{error}</p>}
    </section>
  ) : (
    <>
      {error && <p className="error inline-error">{error}</p>}
      {success && <p className="success inline-success">{success}</p>}

      {view === 'dashboard' && renderDashboard()}
      {view === 'clients' && (selectedClient ? renderClientRecord() : renderClientList())}
      {view === 'tasks' && renderPlaceholder('Tasks')}
      {view === 'reporting' && renderPlaceholder('Reporting')}
      {view === 'admin' && renderAdminTab()}
    </>
  )}
</main>
</div>
);
}
