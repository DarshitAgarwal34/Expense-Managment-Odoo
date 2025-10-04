import { useState } from 'react';

const API_BASE = 'http://localhost:5000/api';

function App() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Expense Submission State (Employee)
  const [expenseForm, setExpenseForm] = useState({
    title: '',
    description: '',
    amount: '',
    currency: 'USD',
    category: 'Meals'
  });
  const [submitMessage, setSubmitMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Approval Queue State (Manager)
  const [approvalQueue, setApprovalQueue] = useState([]);
  const [convertedAmounts, setConvertedAmounts] = useState({});
  const [loadingQueue, setLoadingQueue] = useState(false);

  // All Expenses State (Admin)
  const [allExpenses, setAllExpenses] = useState([]);

  // Tab State
  const [activeTab, setActiveTab] = useState('pending');

  // ==================== Authentication ====================

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setCurrentUser(data.user);
        setLoginEmail('');
        setLoginPassword('');
        
        if (data.user.role === 'Manager') {
          fetchApprovalQueue(data.user.id);
        } else if (data.user.role === 'Admin') {
          fetchAllExpenses();
        }
      } else {
        setLoginError(data.error || 'Login failed');
      }
    } catch (error) {
      setLoginError('Network error. Please try again.');
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setApprovalQueue([]);
    setAllExpenses([]);
    setConvertedAmounts({});
  };

  // ==================== Employee: Submit Expense ====================

  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    setSubmitMessage('');
    setIsSubmitting(true);

    if (!expenseForm.title || !expenseForm.amount) {
      setSubmitMessage('Please fill in all required fields');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          title: expenseForm.title,
          description: expenseForm.description,
          amount: parseFloat(expenseForm.amount),
          currency: expenseForm.currency,
          category: expenseForm.category
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSubmitMessage('success');
        setExpenseForm({
          title: '',
          description: '',
          amount: '',
          currency: 'USD',
          category: 'Meals'
        });
        setTimeout(() => setSubmitMessage(''), 3000);
      } else {
        setSubmitMessage('error');
      }
    } catch (error) {
      setSubmitMessage('error');
      console.error('Submit error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==================== Manager: Approval Queue ====================

  const fetchApprovalQueue = async (userId) => {
    setLoadingQueue(true);
    try {
      const response = await fetch(`${API_BASE}/approvals/${userId}`);
      const data = await response.json();

      if (response.ok && data.success) {
        setApprovalQueue(data.approvals);
        
        data.approvals.forEach(expense => {
          if (expense.currency !== 'USD') {
            fetchConvertedAmount(expense.id, expense.amount, expense.currency);
          }
        });
      }
    } catch (error) {
      console.error('Error fetching approval queue:', error);
    } finally {
      setLoadingQueue(false);
    }
  };

  const fetchConvertedAmount = async (expenseId, amount, fromCurrency) => {
    try {
      const response = await fetch(
        `${API_BASE}/utility/currency?from=${fromCurrency}&to=USD&amount=${amount}`
      );
      const data = await response.json();

      if (response.ok && data.success) {
        setConvertedAmounts(prev => ({
          ...prev,
          [expenseId]: data.converted_amount
        }));
      }
    } catch (error) {
      console.error('Currency conversion error:', error);
    }
  };

  const handleApproval = async (stepId, decision) => {
    const comments = decision === 'rejected' 
      ? prompt('Enter rejection reason:') 
      : prompt('Add comments (optional):') || '';

    try {
      const response = await fetch(`${API_BASE}/approvals/${stepId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, comments })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert(`✅ Expense ${decision === 'approved' ? 'approved' : 'rejected'} successfully!`);
        fetchApprovalQueue(currentUser.id);
      } else {
        alert('❌ ' + (data.error || 'Action failed'));
      }
    } catch (error) {
      alert('❌ Network error');
      console.error('Approval error:', error);
    }
  };

  // ==================== Admin: View All Expenses ====================

  const fetchAllExpenses = async () => {
    try {
      const response = await fetch(`${API_BASE}/expenses/all`);
      const data = await response.json();

      if (response.ok && data.success) {
        setAllExpenses(data.expenses);
      }
    } catch (error) {
      console.error('Error fetching all expenses:', error);
    }
  };

  const getCategoryIcon = (category) => {
    const icons = {
      'Meals': '🍽️',
      'Travel': '✈️',
      'Office Supplies': '📦',
      'Software': '💻',
      'Other': '📌'
    };
    return icons[category] || '📌';
  };

  const getRoleColor = (role) => {
    const colors = {
      'Employee': 'bg-blue-500',
      'Manager': 'bg-purple-500',
      'Admin': 'bg-red-500'
    };
    return colors[role] || 'bg-gray-500';
  };

  // ==================== Render ====================

  // Login Screen
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4 relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-40 w-80 h-80 bg-white rounded-full mix-blend-overlay filter blur-xl opacity-20 animate-pulse"></div>
          <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-white rounded-full mix-blend-overlay filter blur-xl opacity-20 animate-pulse" style={{animationDelay: '1s'}}></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-white rounded-full mix-blend-overlay filter blur-xl opacity-10 animate-pulse" style={{animationDelay: '2s'}}></div>
        </div>

        <div className="relative bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 w-full max-w-md border border-white/20 transform hover:scale-105 transition-all duration-300">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mb-4 shadow-lg">
              <span className="text-4xl">💰</span>
            </div>
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 mb-2">
              Expense Manager
            </h1>
            <p className="text-gray-600 font-medium">Smart expense tracking for modern teams</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="relative">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400">
                  📧
                </span>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-indigo-200 focus:border-indigo-500 transition-all outline-none"
                  placeholder="user@company.com"
                  required
                />
              </div>
            </div>

            <div className="relative">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400">
                  🔒
                </span>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-indigo-200 focus:border-indigo-500 transition-all outline-none"
                  placeholder="Enter your password"
                  required
                />
              </div>
            </div>

            {loginError && (
              <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-lg animate-shake">
                <span className="font-medium">⚠️ {loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3.5 px-6 rounded-xl font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600 mb-3 font-semibold text-center">🎭 Demo Accounts</p>
            <div className="space-y-2">
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-4 py-2.5 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-blue-800">👤 Employee</span>
                  <span className="text-xs text-blue-600 font-mono">emp123</span>
                </div>
                <p className="text-xs text-blue-700 mt-1 font-medium">employee1@company.com</p>
              </div>
              <div className="bg-gradient-to-r from-purple-50 to-purple-100 px-4 py-2.5 rounded-lg border border-purple-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-purple-800">👔 Manager</span>
                  <span className="text-xs text-purple-600 font-mono">manager123</span>
                </div>
                <p className="text-xs text-purple-700 mt-1 font-medium">manager@company.com</p>
              </div>
              <div className="bg-gradient-to-r from-red-50 to-red-100 px-4 py-2.5 rounded-lg border border-red-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-red-800">⚙️ Admin</span>
                  <span className="text-xs text-red-600 font-mono">admin123</span>
                </div>
                <p className="text-xs text-red-700 mt-1 font-medium">admin@company.com</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main Dashboard (Post-Login)
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Enhanced Header */}
      <header className="bg-white shadow-md border-b-2 border-indigo-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-2xl">💰</span>
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-800">Expense Manager</h1>
                <p className="text-sm text-gray-600 flex items-center gap-2">
                  Welcome, <span className="font-bold text-gray-800">{currentUser.name}</span>
                  <span className={`px-3 py-1 ${getRoleColor(currentUser.role)} text-white rounded-full text-xs font-bold shadow-md`}>
                    {currentUser.role}
                  </span>
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="px-6 py-2.5 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
            >
              🚪 Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Employee View */}
        {currentUser.role === 'Employee' && (
          <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <span className="text-2xl">📝</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Submit New Expense</h2>
                <p className="text-sm text-gray-600">Fill in the details below</p>
              </div>
            </div>
            
            <form onSubmit={handleExpenseSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Expense Title *
                  </label>
                  <input
                    type="text"
                    value={expenseForm.title}
                    onChange={(e) => setExpenseForm({...expenseForm, title: e.target.value})}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all outline-none"
                    placeholder="e.g., Client Lunch Meeting"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Category
                  </label>
                  <select
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm({...expenseForm, category: e.target.value})}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all outline-none"
                  >
                    <option value="Meals">🍽️ Meals</option>
                    <option value="Travel">✈️ Travel</option>
                    <option value="Office Supplies">📦 Office Supplies</option>
                    <option value="Software">💻 Software</option>
                    <option value="Other">📌 Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Amount *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all outline-none"
                    placeholder="0.00"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Currency
                  </label>
                  <select
                    value={expenseForm.currency}
                    onChange={(e) => setExpenseForm({...expenseForm, currency: e.target.value})}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all outline-none"
                  >
                    <option value="USD">💵 USD</option>
                    <option value="EUR">💶 EUR</option>
                    <option value="GBP">💷 GBP</option>
                    <option value="INR">💴 INR</option>
                    <option value="CAD">🍁 CAD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-200 focus:border-blue-500 transition-all outline-none resize-none"
                  rows="4"
                  placeholder="Provide additional details about this expense..."
                />
              </div>

              {submitMessage && (
                <div className={`px-6 py-4 rounded-xl border-l-4 ${
                  submitMessage === 'success'
                    ? 'bg-green-50 border-green-500 text-green-800' 
                    : 'bg-red-50 border-red-500 text-red-800'
                }`}>
                  <span className="font-bold">
                    {submitMessage === 'success' ? '✅ Expense submitted successfully!' : '❌ Submission failed. Please try again.'}
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 px-6 rounded-xl font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Submitting...
                  </span>
                ) : (
                  '🚀 Submit Expense'
                )}
              </button>
            </form>
          </div>
        )}

        {/* Manager View */}
        {currentUser.role === 'Manager' && (
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 px-6 py-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <span className="text-2xl">📋</span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Approval Queue</h2>
                  <p className="text-purple-100 text-sm">{approvalQueue.length} pending approvals</p>
                </div>
              </div>
              <button
                onClick={() => fetchApprovalQueue(currentUser.id)}
                className="px-6 py-2.5 bg-white/20 backdrop-blur-sm text-white rounded-xl hover:bg-white/30 transition font-bold border border-white/30"
              >
                🔄 Refresh
              </button>
            </div>

            {loadingQueue ? (
              <div className="p-12 text-center">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                <p className="mt-4 text-gray-600 font-medium">Loading approvals...</p>
              </div>
            ) : approvalQueue.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">🎉</span>
                </div>
                <p className="text-gray-600 font-medium text-lg">No pending approvals</p>
                <p className="text-gray-500 text-sm mt-2">You're all caught up!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="inline-block min-w-full align-middle">
                  <div className="overflow-hidden">
                    {approvalQueue.map((expense, index) => (
                      <div key={expense.id} className={`p-6 border-b border-gray-100 hover:bg-gray-50 transition ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                          <div className="flex-1 space-y-3">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                                <span className="text-xl">{getCategoryIcon(expense.category)}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-bold text-gray-800 truncate">{expense.title}</h3>
                                <p className="text-sm text-gray-600 mt-1">{expense.description || 'No description'}</p>
                                <div className="flex flex-wrap items-center gap-3 mt-2">
                                  <span className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold">
                                    👤 {expense.submitter_name}
                                  </span>
                                  <span className="inline-flex items-center px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-bold">
                                    {getCategoryIcon(expense.category)} {expense.category}
                                  </span>
                                  <span className="text-xs text-gray-500 font-medium">
                                    📅 {new Date(expense.submitted_at).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 pl-13">
                              <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-2 rounded-lg border border-green-200">
                                <p className="text-xs text-green-700 font-medium">Original Amount</p>
                                <p className="text-xl font-bold text-green-800">{expense.amount.toFixed(2)} {expense.currency}</p>
                              </div>
                              {expense.currency !== 'USD' && (
                                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2 rounded-lg border border-blue-200">
                                  <p className="text-xs text-blue-700 font-medium">USD Equivalent</p>
                                  <p className="text-xl font-bold text-blue-800">
                                    {convertedAmounts[expense.id] ? `$${convertedAmounts[expense.id].toFixed(2)}` : '⏳ Converting...'}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-3 lg:flex-col">
                            <button
                              onClick={() => handleApproval(expense.approval_step_id, 'approved')}
                              className="flex-1 lg:flex-none px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => handleApproval(expense.approval_step_id, 'rejected')}
                              className="flex-1 lg:flex-none px-6 py-3 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
                            >
                              ✗ Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Admin View */}
        {currentUser.role === 'Admin' && (
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
            <div className="bg-gradient-to-r from-red-500 to-pink-600 px-6 py-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <span className="text-2xl">📊</span>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">All Expenses</h2>
                  <p className="text-red-100 text-sm">{allExpenses.length} total expenses</p>
                </div>
              </div>
              <button
                onClick={fetchAllExpenses}
                className="px-6 py-2.5 bg-white/20 backdrop-blur-sm text-white rounded-xl hover:bg-white/30 transition font-bold border border-white/30"
              >
                🔄 Refresh
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-6 bg-gray-50">
              {['all', 'pending', 'approved', 'rejected'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-4 font-bold text-sm uppercase tracking-wide transition-all relative ${
                    activeTab === tab
                      ? 'text-red-600 border-b-2 border-red-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'all' && '📋 All'}
                  {tab === 'pending' && '⏳ Pending'}
                  {tab === 'approved' && '✅ Approved'}
                  {tab === 'rejected' && '❌ Rejected'}
                </button>
              ))}
            </div>

            {allExpenses.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">📭</span>
                </div>
                <p className="text-gray-600 font-medium text-lg">No expenses found</p>
                <p className="text-gray-500 text-sm mt-2">Expenses will appear here once submitted</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="inline-block min-w-full align-middle">
                  <div className="overflow-hidden">
                    {allExpenses
                      .filter(exp => activeTab === 'all' || exp.status.toLowerCase() === activeTab)
                      .map((expense, index) => (
                        <div key={expense.id} className={`p-6 border-b border-gray-100 hover:bg-gray-50 transition ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                            <div className="flex-1 space-y-3">
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-pink-600 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <span className="text-xl">{getCategoryIcon(expense.category)}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-mono">
                                      #{expense.id}
                                    </span>
                                    <h3 className="text-lg font-bold text-gray-800 truncate">{expense.title}</h3>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3 mt-2">
                                    <span className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold">
                                      👤 {expense.submitter_name}
                                    </span>
                                    <span className="inline-flex items-center px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-bold">
                                      {getCategoryIcon(expense.category)} {expense.category}
                                    </span>
                                    <span className="text-xs text-gray-500 font-medium">
                                      📅 {new Date(expense.submitted_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-4 py-2 rounded-lg border border-green-200">
                                <p className="text-xs text-green-700 font-medium">Amount</p>
                                <p className="text-xl font-bold text-green-800">{expense.amount.toFixed(2)} {expense.currency}</p>
                              </div>
                              <div>
                                <span className={`px-4 py-2 inline-flex items-center text-sm font-bold rounded-xl shadow-md ${
                                  expense.status === 'Approved' 
                                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white'
                                    : expense.status === 'Rejected'
                                    ? 'bg-gradient-to-r from-red-500 to-pink-600 text-white'
                                    : 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white'
                                }`}>
                                  {expense.status === 'Approved' && '✅'}
                                  {expense.status === 'Rejected' && '❌'}
                                  {expense.status === 'Pending' && '⏳'}
                                  {' '}{expense.status}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    {allExpenses.filter(exp => activeTab === 'all' || exp.status.toLowerCase() === activeTab).length === 0 && (
                      <div className="p-12 text-center">
                        <p className="text-gray-500 font-medium">No {activeTab} expenses found</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-8 text-center text-gray-500 text-sm">
        <p className="font-medium">💰 Expense Manager v1.0 - Built for Hackathon</p>
        <p className="mt-1">Powered by Flask + React + Tailwind CSS</p>
      </footer>
    </div>
  );
}

export default App;