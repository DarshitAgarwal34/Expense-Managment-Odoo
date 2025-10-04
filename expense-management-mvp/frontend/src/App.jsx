import React, { useState, useEffect } from 'react';
// Since this version needs to be self-contained for the canvas, 
// we assume React and ReactDOM are globally available or imported 
// via a script tag in a surrounding index.html, but we keep the imports 
// for modern syntax consistency.

const API_BASE = 'http://localhost:5000/api';

// --- Message Toast Component (Professional UI Alert System) ---
const MessageToast = ({ message, type, onClose }) => {
    if (!message) return null;
    const styles = {
        success: 'bg-green-600 border-green-800',
        error: 'bg-red-600 border-red-800',
        warning: 'bg-yellow-600 border-yellow-800'
    };
    return (
        <div className={`fixed bottom-5 right-5 p-4 rounded-lg shadow-xl text-white font-semibold border-l-4 ${styles[type]} transition-opacity duration-300 ease-out z-[999]`}>
            {message}
            <button onClick={onClose} className="ml-4 text-white opacity-75 hover:opacity-100 font-extrabold text-lg leading-none">&times;</button>
        </div>
    );
};

// FIX: Changed function declaration to const with export default 
// to ensure the component is properly exported and imported by the environment, 
// fixing the "reading 'default'" error.
const App = () => {
    // --- Global State ---
    const [toastMessage, setToastMessage] = useState(null);
    const [toastType, setToastType] = useState('success');
    
    // Authentication State
    const [currentUser, setCurrentUser] = useState(null);
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);

    // Registration State
    const [regForm, setRegForm] = useState({ name: '', email: '', password: '' });
    const [regError, setRegError] = useState('');
    const [isRegLoading, setIsRegLoading] = useState(false);

    // Expense Submission State (Employee)
    const [expenseForm, setExpenseForm] = useState({
        title: '',
        description: '',
        amount: '',
        currency: 'USD',
        category: 'Meals',
        date: new Date().toISOString().substring(0, 10)
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [employeeHistory, setEmployeeHistory] = useState([]);

    // Approval Queue State (Manager)
    const [approvalQueue, setApprovalQueue] = useState([]);
    const [convertedAmounts, setConvertedAmounts] = useState({});
    const [loadingQueue, setLoadingQueue] = useState(false);

    // All Expenses State (Admin)
    const [allExpenses, setAllExpenses] = useState([]);
    
    // Admin User Management State
    const [allUsers, setAllUsers] = useState([]);
    const [managers, setManagers] = useState([]);
    const [isUserManagementLoading, setIsUserManagementLoading] = useState(false);
    const [userForm, setUserForm] = useState({ id: null, name: '', email: '', password: '', role: 'Employee', manager_id: null });


    // Tab State
    const [employeeTab, setEmployeeTab] = useState('submit');
    const [adminTab, setAdminTab] = useState('expenses'); // 'expenses', 'users', 'all', 'pending', 'approved', 'rejected'
    
    // --- Utility Functions ---
    const showToast = (message, type = 'success') => {
        setToastMessage(message);
        setToastType(type);
        setTimeout(() => setToastMessage(null), 4000);
    };

    const getCategoryIcon = (category) => {
        const icons = {
            'Meals': '🍽️', 'Travel': '✈️', 'Office Supplies': '📦', 
            'Software': '💻', 'Other': '📌'
        };
        return icons[category] || '📌';
    };

    const getRoleColor = (role) => {
        const colors = {
            'Employee': 'bg-sky-500', 'Manager': 'bg-indigo-600', 
            'Admin': 'bg-gray-800'
        };
        return colors[role] || 'bg-gray-500';
    };

    const getStatusStyle = (status) => {
        switch (status) {
            case 'Approved':
                return 'bg-green-500 text-white';
            case 'Rejected':
                return 'bg-red-500 text-white';
            case 'Waiting':
            case 'Pending':
            case 'Skipped':
            default:
                return 'bg-yellow-500 text-white';
        }
    };

    // ==================== API Handlers ====================

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
                showToast(`Welcome back, ${data.user.name}!`, 'success');
                
                if (data.user.role === 'Employee') {
                    fetchEmployeeHistory(data.user.id);
                } else if (data.user.role === 'Manager') {
                    fetchApprovalQueue(data.user.id);
                } else if (data.user.role === 'Admin') {
                    // Fetch all data necessary for Admin view
                    fetchAllExpenses();
                    fetchAllUsers();
                    // Reset tab state to default expense view if coming from login
                    setAdminTab('all'); 
                }
            } else {
                setLoginError(data.error || 'Login failed. Check credentials.');
            }
        } catch (error) {
            setLoginError('Network error. Could not connect to API.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegistration = async (e) => {
        e.preventDefault();
        setRegError('');
        setIsRegLoading(true);

        try {
            const response = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(regForm)
            });
            const data = await response.json();

            if (response.ok && data.success) {
                showToast('✅ Account created successfully. Please log in.', 'success');
                setIsRegistering(false);
                setLoginEmail(regForm.email);
                setLoginPassword('');
                setRegForm({ name: '', email: '', password: '' });
            } else {
                setRegError(data.error || 'Registration failed.');
            }
        } catch (error) {
            setRegError('Network error. Could not complete registration.');
        } finally {
            setIsRegLoading(false);
        }
    };

    const handleLogout = () => {
        setCurrentUser(null);
        setApprovalQueue([]);
        setAllExpenses([]);
        setEmployeeHistory([]);
        setAllUsers([]);
        setManagers([]);
        setConvertedAmounts({});
        showToast("Logged out successfully.", 'warning');
    };

    const fetchEmployeeHistory = async (userId) => {
        if (!userId) return;
        try {
            const response = await fetch(`${API_BASE}/expenses/history/${userId}`);
            const data = await response.json();
            if (response.ok && data.success) {
                setEmployeeHistory(data.expenses);
            }
        } catch (error) {
            console.error('Error fetching employee history:', error);
        }
    };

    const handleEmployeeTabChange = (tab) => {
        setEmployeeTab(tab);
        if (tab === 'history') {
            fetchEmployeeHistory(currentUser.id);
        }
    };

    const handleExpenseSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const response = await fetch(`${API_BASE}/expenses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: currentUser.id, title: expenseForm.title, description: expenseForm.description,
                    amount: parseFloat(expenseForm.amount), currency: expenseForm.currency,
                    category: expenseForm.category, date: expenseForm.date
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                showToast('✅ Expense submitted successfully!', 'success');
                setExpenseForm({
                    title: '', description: '', amount: '', currency: 'USD', category: 'Meals', date: new Date().toISOString().substring(0, 10)
                });
                // Fetch history again to ensure the list is up-to-date and complete
                fetchEmployeeHistory(currentUser.id); 
                handleEmployeeTabChange('history');
            } else {
                showToast('❌ Submission failed. ' + (data.error || 'Try again.'), 'error');
            }
        } catch (error) {
            showToast('❌ Network error during submission.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    // FIX: This now groups expenses to avoid showing duplicates in the queue
    const fetchApprovalQueue = async (userId) => {
        setLoadingQueue(true);
        try {
            const response = await fetch(`${API_BASE}/approvals/${userId}`);
            const data = await response.json();

            if (response.ok && data.success) {
                // Group the received approval steps by expense ID
                const expenseMap = data.approvals.reduce((acc, expense) => {
                    const existing = acc[expense.id] || { ...expense, approval_steps: expense.approval_steps };

                    // Find the approval step relevant to the current user
                    const userStep = expense.approval_steps.find(s => s.approver_id === userId);
                    
                    // Add the relevant step ID needed for processing the approval
                    // This is the step ID the manager/admin will approve/reject.
                    existing.approval_step_id = userStep ? userStep.id : null; 
                    
                    acc[expense.id] = existing;
                    return acc;
                }, {});

                const uniqueExpenses = Object.values(expenseMap);
                setApprovalQueue(uniqueExpenses);
                
                uniqueExpenses.forEach(expense => {
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
        const comments = decision === 'rejected' ? 'Rejected due to policy.' : 'Approved.'; 
        showToast(`Processing ${decision} request...`, 'warning'); 

        try {
            const response = await fetch(`${API_BASE}/approvals/${stepId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision, comments })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                showToast(`✅ Expense ${decision} successfully!`, 'success');
                // Re-fetch queue and history/all expenses to update state
                if (currentUser.role === 'Manager' || currentUser.role === 'Admin') {
                    fetchApprovalQueue(currentUser.id);
                }
                if (currentUser.role === 'Admin') {
                    fetchAllExpenses();
                } else if (currentUser.role === 'Employee') {
                    fetchEmployeeHistory(currentUser.id);
                }
            } else {
                showToast('❌ ' + (data.error || 'Action failed'), 'error');
            }
        } catch (error) {
            showToast('❌ Network error', 'error');
        }
    };
    
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
    
    const fetchAllUsers = async () => {
        setIsUserManagementLoading(true);
        try {
            const response = await fetch(`${API_BASE}/users`);
            const data = await response.json();

            if (response.ok && data.success) {
                setAllUsers(data.users);
                // Managers/Admins for the manager dropdown list
                setManagers(data.users.filter(u => u.role === 'Manager' || u.role === 'Admin'));
            }
        } catch (error) {
            console.error('Error fetching all users:', error);
        } finally {
            setIsUserManagementLoading(false);
        }
    };

    // Resets the user form to creation state
    const resetUserForm = () => {
        setUserForm({ id: null, name: '', email: '', password: '', role: 'Employee', manager_id: null });
    };

    const handleUserSubmit = async (e) => {
        e.preventDefault();
        
        const isCreating = userForm.id === null;
        const endpoint = isCreating ? `${API_BASE}/admin/users/create` : `${API_BASE}/admin/users/${userForm.id}`;
        const method = isCreating ? 'POST' : 'PUT';

        // Prepare payload, excluding manager_id if not selected (null)
        const payload = { ...userForm };
        if (!payload.manager_id || payload.manager_id === 'null') {
             payload.manager_id = null;
        } else {
             payload.manager_id = parseInt(payload.manager_id); // Ensure integer ID is sent
        }
        
        // Remove password if updating and field is empty
        if (!isCreating && !payload.password) {
            delete payload.password;
        }
        
        // Only Admin can set company_id=1 for this demo
        if (isCreating) {
            payload.company_id = currentUser.company_id || 1; 
        }

        try {
            const response = await fetch(endpoint, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                showToast(`✅ User ${isCreating ? 'created' : 'updated'} successfully!`, 'success');
                fetchAllUsers();
                resetUserForm();
            } else {
                showToast(`❌ Failed to ${isCreating ? 'create' : 'update'} user. ` + (data.error || 'Try again.'), 'error');
            }
        } catch (error) {
            showToast('❌ Network error during user management.', 'error');
        }
    };
    
    const handleDeleteUser = async (userId) => {
        // Using window.confirm temporarily, though best practice is a custom modal UI.
        if (!window.confirm("Are you sure you want to delete this user? This action cannot be undone and reports will be reassigned.")) return;

        try {
            const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
                method: 'DELETE',
            });

            const data = await response.json();

            if (response.ok && data.success) {
                showToast(`🗑️ User deleted successfully.`, 'warning');
                fetchAllUsers();
            } else {
                showToast(`❌ Failed to delete user. ` + (data.error || 'Try again.'), 'error');
            }
        } catch (error) {
            showToast('❌ Network error during user deletion.', 'error');
        }
    };


    // ==================== Render Components ====================

    // Expense History Component
    const EmployeeHistory = () => (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold text-gray-700 border-b border-gray-200 pb-3">Your Expense History</h3>
            {employeeHistory.length === 0 ? (
                <p className="text-gray-500 p-6 bg-white rounded-xl border shadow-lg">No expenses submitted yet. Get started!</p>
            ) : (
                <div className="space-y-4">
                    {employeeHistory.map(expense => (
                        <div key={expense.id} className={`p-5 rounded-xl bg-white shadow-lg transition duration-200 hover:shadow-xl border ${expense.status === 'Approved' ? 'border-green-300' : expense.status === 'Rejected' ? 'border-red-300' : 'border-yellow-300'}`}>
                            <div className="flex justify-between items-start">
                                <div className='flex-1'>
                                    <p className="text-lg font-bold text-gray-800">{getCategoryIcon(expense.category)} {expense.title}</p>
                                    <p className="text-xl font-extrabold text-sky-700 mt-1">{expense.amount.toFixed(2)} {expense.currency}</p>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Date Incurred: {new Date(expense.date).toLocaleDateString()}
                                    </p>
                                </div>
                                <span className={`px-3 py-1 inline-flex items-center text-sm font-bold rounded-full ${getStatusStyle(expense.status)} text-white shadow-sm`}>
                                    {expense.status}
                                </span>
                            </div>
                            
                            <div className="mt-4 pt-3 border-t border-gray-100">
                                <h4 className="text-xs font-semibold text-gray-700 mb-2 uppercase">Approval Flow (Parallel Check)</h4>
                                <ol className="relative border-l border-gray-300 ml-4">
                                    {/* Display all approval steps for this expense. Added null check for robustness. */}
                                    {(expense.approval_steps || []).map(step => (
                                        <li key={step.id} className="ml-6 flex items-start space-x-2 mb-3">
                                            <span className={`absolute flex items-center justify-center w-5 h-5 rounded-full -left-2.5 ring-4 ring-white ${getStatusStyle(step.status)}`}>
                                                {step.status === 'Approved' ? '✓' : step.status === 'Rejected' ? '✗' : step.status === 'Skipped' ? '—' : '...'}
                                            </span>
                                            <div className='flex flex-col text-gray-800'>
                                                <p className="text-sm font-semibold">{step.approver_name} (Seq {step.sequence})</p>
                                                <p className="text-xs text-gray-500">
                                                    {step.comments || (step.status === 'Waiting' ? 'Awaiting Review' : 
                                                    step.status === 'Skipped' ? 'Skipped/Terminated' : 'No comments provided')}
                                                </p>
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );


    // Admin User Management Component (kept separate for clarity)
    const AdminUserManagement = () => (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* User Form (Create/Edit) */}
            <div className="lg:col-span-1 bg-white rounded-xl shadow-xl p-6 border border-gray-100 h-fit sticky top-20">
                <h3 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-3">
                    {userForm.id === null ? '👤 Create New User' : `✏️ Edit User ID: ${userForm.id}`}
                </h3>
                
                <form onSubmit={handleUserSubmit} className="space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Full Name *</label>
                        <input type="text" value={userForm.name} required
                            onChange={(e) => setUserForm({...userForm, name: e.target.value})}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all outline-none" placeholder="Enter full name"/>
                    </div>
                    
                    {/* Email */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Email *</label>
                        <input type="email" value={userForm.email} required
                            onChange={(e) => setUserForm({...userForm, email: e.target.value})}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all outline-none" placeholder="user@company.com"/>
                    </div>
                    
                    {/* Password (Required for create, optional for update) */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Password {userForm.id === null ? '*' : '(Leave blank to keep old)'}</label>
                        <input type="password" value={userForm.password} 
                            required={userForm.id === null}
                            onChange={(e) => setUserForm({...userForm, password: e.target.value})}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all outline-none" placeholder="Set password"/>
                    </div>
                    
                    {/* Role */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Role *</label>
                        <select value={userForm.role} required
                            onChange={(e) => setUserForm({...userForm, role: e.target.value})}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all outline-none appearance-none bg-white">
                            <option value="Employee">Employee</option>
                            <option value="Manager">Manager</option>
                            <option value="Admin">Admin</option>
                        </select>
                    </div>
                    
                    {/* Manager ID (Only for Employee/Manager roles) */}
                    {(userForm.role === 'Employee' || userForm.role === 'Manager') && (
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Reports To (Manager/Admin)</label>
                            <select value={userForm.manager_id || 'null'} 
                                onChange={(e) => setUserForm({...userForm, manager_id: e.target.value})}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all outline-none appearance-none bg-white">
                                <option value="null">-- None (Top Level) --</option>
                                {managers.map(manager => (
                                    <option key={manager.id} value={manager.id}>
                                        {manager.name} ({manager.role})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <button type="submit" 
                        className="w-full bg-indigo-600 text-white py-3.5 rounded-lg font-bold shadow-md shadow-indigo-600/40 hover:bg-indigo-700 transform hover:scale-[1.005] transition-all duration-200 disabled:opacity-50">
                        {userForm.id === null ? '➕ Create User' : '💾 Save Changes'}
                    </button>
                    
                    {userForm.id !== null && (
                        <button type="button" onClick={resetUserForm}
                            className="w-full bg-gray-200 text-gray-700 py-3.5 rounded-lg font-bold hover:bg-gray-300 transition-all duration-200">
                            Cancel Edit
                        </button>
                    )}
                </form>
            </div>

            {/* User List */}
            <div className="lg:col-span-2 space-y-4">
                <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl shadow-md border border-gray-200">
                    <h3 className="text-2xl font-bold text-gray-800">All Users ({allUsers.length})</h3>
                    <button onClick={fetchAllUsers} disabled={isUserManagementLoading}
                        className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition font-semibold shadow-md disabled:opacity-50">
                        {isUserManagementLoading ? 'Loading...' : '🔄 Refresh List'}
                    </button>
                </div>
                
                {isUserManagementLoading ? (<div className="p-6 text-center text-gray-500 bg-white rounded-xl shadow-xl">Loading user data...</div>) : (
                    <div className="bg-white rounded-xl shadow-xl overflow-hidden divide-y divide-gray-100 border border-gray-200">
                        {allUsers.map(user => (
                            <div key={user.id} className="p-4 flex flex-col sm:flex-row justify-between items-center transition duration-200 hover:bg-gray-50">
                                <div className="flex-1 min-w-0 space-y-1 sm:space-y-0 sm:flex sm:items-center sm:gap-4">
                                    <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-mono">ID: #{user.id}</span>
                                    <p className="text-lg font-bold text-gray-800 truncate">{user.name}</p>
                                    <span className={`px-2 py-0.5 ${getRoleColor(user.role)} text-white rounded-full text-xs font-bold shadow-md`}>
                                        {user.role}
                                    </span>
                                </div>
                                <div className="flex flex-col text-sm text-gray-500 mt-2 sm:mt-0 sm:text-right">
                                    <p className="font-medium truncate">{user.email}</p>
                                    <p className="text-xs">Reports to: <span className="font-semibold text-gray-700">{user.manager_name}</span></p>
                                </div>
                                <div className="flex gap-2 mt-3 sm:mt-0 sm:ml-4">
                                    <button onClick={() => setUserForm({ id: user.id, name: user.name, email: user.email, password: '', role: user.role, manager_id: user.manager_id || 'null' })}
                                        className="px-3 py-1 bg-sky-500 text-white rounded-lg font-semibold hover:bg-sky-600 transition-all text-sm shadow-md">
                                        Edit
                                    </button>
                                    <button onClick={() => handleDeleteUser(user.id)}
                                        className="px-3 py-1 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition-all text-sm shadow-md disabled:opacity-50"
                                        disabled={user.role === 'Admin' && allUsers.filter(u => u.role === 'Admin').length === 1}>
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    // Manager Approval Item Component - Used in Manager View to display one unique expense
    const ApprovalQueueItem = ({ expense, currentUser, handleApproval, convertedAmounts }) => {
        // Find the specific step ID relevant to the currentUser for this expense
        const currentUserStep = expense.approval_steps.find(step => step.approver_id === currentUser.id);
        const stepId = currentUserStep ? currentUserStep.id : null;
        
        // Determine if this user has already acted on this expense
        const isWaiting = currentUserStep && currentUserStep.status === 'Waiting';

        // Display current status for the current user
        const statusText = isWaiting ? 'Awaiting your action' : currentUserStep?.status || 'Error';
        const statusColor = getStatusStyle(statusText.includes('Awaiting') ? 'Waiting' : currentUserStep?.status);
        
        // Show status of other approvers
        const otherSteps = expense.approval_steps.filter(step => step.approver_id !== currentUser.id);
        const pendingCount = otherSteps.filter(s => s.status === 'Waiting').length;
        const approvedCount = otherSteps.filter(s => s.status === 'Approved').length;
        const totalSteps = expense.approval_steps.length;


        return (
            <div className={`p-5 transition duration-200 hover:bg-gray-50 ${isWaiting ? 'bg-yellow-50/50' : 'bg-white'}`}>
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex-1 space-y-2">
                        {/* Expense Details */}
                        <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-bold text-gray-800 truncate">{getCategoryIcon(expense.category)} {expense.title}</h3>
                                <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                                    <span className="font-semibold">👤 {expense.submitter_name}</span>
                                    <span>| ID: #{expense.id}</span>
                                    <span>| 📅 {new Date(expense.submitted_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                        {/* Status and Amounts */}
                        <div className="flex flex-wrap items-center gap-4 pt-2">
                            <div className="bg-gray-50 px-4 py-2 rounded-lg border border-gray-200 shadow-inner">
                                <p className="text-xs text-gray-500 font-medium">Original Amount</p>
                                <p className="text-xl font-bold text-blue-800">{expense.amount.toFixed(2)} {expense.currency}</p>
                            </div>
                            {expense.currency !== 'USD' && (
                                <div className="bg-sky-50 px-4 py-2 rounded-lg border border-sky-200 shadow-inner">
                                    <p className="text-xs text-sky-600 font-medium">USD Value</p>
                                    <p className="text-xl font-bold text-sky-700">
                                        {convertedAmounts[expense.id] ? `$${convertedAmounts[expense.id].toFixed(2)}` : '...'}
                                    </p>
                                </div>
                            )}
                            {/* Parallel Approval Progress Indicator */}
                            <div className="bg-indigo-50 px-4 py-2 rounded-lg border border-indigo-200 shadow-inner">
                                <p className="text-xs text-indigo-600 font-medium">Parallel Approval Status</p>
                                <p className="text-xl font-bold text-indigo-700">
                                    {approvedCount} / {totalSteps - 1} Approved
                                </p>
                                <p className="text-xs text-indigo-500">{pendingCount} pending reviews</p>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 mt-4 lg:mt-0 lg:flex-row lg:w-fit w-full">
                        <button onClick={() => handleApproval(stepId, 'approved')}
                            className="flex-1 px-5 py-2.5 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 transition-all shadow-md shadow-green-500/50 transform hover:scale-[1.01] disabled:opacity-50"
                            disabled={!isWaiting || !stepId}>
                            ✓ Approve
                        </button>
                        <button onClick={() => handleApproval(stepId, 'rejected')}
                            className="flex-1 px-5 py-2.5 bg-red-500 text-white rounded-lg font-bold hover:bg-red-600 transition-all shadow-md shadow-red-500/50 transform hover:scale-[1.01] disabled:opacity-50"
                            disabled={!isWaiting || !stepId}>
                            ✗ Reject
                        </button>
                    </div>
                </div>
            </div>
        );
    }


    return (
        <div className="min-h-screen bg-gray-100 text-gray-800 font-sans">
            {/* Enhanced Header */}
            <header className="bg-white shadow-lg sticky top-0 z-50 border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-sky-500 rounded-full flex items-center justify-center shadow-md">
                                <span className="text-xl text-white">💰</span>
                            </div>
                            <div>
                                <h1 className="text-xl font-black text-gray-900">EXPENSE MANAGER</h1>
                                <p className="text-xs text-gray-600 flex items-center gap-2">
                                    User: <span className="font-bold text-gray-800">{currentUser?.name || 'Guest'}</span>
                                    <span className={`px-2 py-0.5 ${getRoleColor(currentUser?.role)} text-white rounded-full text-xs font-bold shadow-md`}>
                                        {currentUser?.role || 'Logging In'}
                                    </span>
                                </p>
                            </div>
                        </div>
                        {currentUser && (
                            <button
                                onClick={handleLogout}
                                className="px-5 py-2 bg-red-500 text-white rounded-lg font-bold hover:bg-red-600 transition-all shadow-md shadow-red-500/30 text-sm"
                            >
                                🚪 Logout
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-8">
                
                {/* --- Employee View --- */}
                {currentUser?.role === 'Employee' && (
                    <div className="space-y-6">
                        {/* Tabs for Employee */}
                        <div className="flex border-b border-gray-300 bg-white shadow-xl rounded-xl overflow-hidden p-1">
                            {['submit', 'history'].map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => handleEmployeeTabChange(tab)}
                                    className={`flex-1 px-6 py-3 font-bold text-sm uppercase tracking-wide rounded-lg transition-all ${
                                        employeeTab === tab
                                            ? 'bg-sky-500 text-white shadow-md'
                                            : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                                >
                                    {tab === 'submit' ? '📝 New Expense' : '⏱️ Expense History'}
                                </button>
                            ))}
                        </div>

                        {/* Submission Form */}
                        {employeeTab === 'submit' && (
                            <div className="bg-white rounded-xl shadow-xl p-6 sm:p-8 border border-gray-100">
                                <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-3">Submit New Expense</h2>
                                
                                <form onSubmit={handleExpenseSubmit} className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Input Fields */}
                                        {['title', 'date', 'category', 'currency', 'amount'].map(field => {
                                            if (field === 'amount') {
                                                return (
                                                    <div key={field}>
                                                        <label className="block text-sm font-semibold text-gray-700 mb-2 capitalize">{field} *</label>
                                                        <input type="number" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
                                                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all outline-none" placeholder="0.00" required/>
                                                    </div>
                                                );
                                            } else if (field === 'date') {
                                                 return (
                                                    <div key={field}>
                                                        <label className="block text-sm font-semibold text-gray-700 mb-2 capitalize">Date Incurred *</label>
                                                        <input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm({...expenseForm, date: e.target.value})}
                                                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all outline-none" required/>
                                                    </div>
                                                );
                                            } else if (field === 'category' || field === 'currency') {
                                                return (
                                                    <div key={field}>
                                                        <label className="block text-sm font-semibold text-gray-700 mb-2 capitalize">{field}</label>
                                                        <select value={expenseForm[field]} onChange={(e) => setExpenseForm({...expenseForm, [field]: e.target.value})}
                                                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all outline-none appearance-none bg-white">
                                                            {field === 'category' && (
                                                                <>
                                                                    <option value="Meals">🍽️ Meals</option><option value="Travel">✈️ Travel</option>
                                                                    <option value="Office Supplies">📦 Supplies</option><option value="Software">💻 Software</option><option value="Other">📌 Other</option>
                                                                </>
                                                            )}
                                                            {field === 'currency' && (
                                                                <>
                                                                    <option value="USD">💵 USD</option><option value="EUR">💶 EUR</option>
                                                                    <option value="GBP">💷 GBP</option><option value="INR">💴 INR</option><option value="CAD">🍁 CAD</option>
                                                                </>
                                                            )}
                                                        </select>
                                                    </div>
                                                );
                                            } else {
                                                return (
                                                    <div key={field}>
                                                        <label className="block text-sm font-semibold text-gray-700 mb-2 capitalize">{field} *</label>
                                                        <input type="text" value={expenseForm[field]} onChange={(e) => setExpenseForm({...expenseForm, [field]: e.target.value})}
                                                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all outline-none" placeholder={`e.g., ${field} here`} required/>
                                                    </div>
                                                )
                                            }
                                        })}
                                    </div>
                                    {/* Description */}
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                                        <textarea value={expenseForm.description} onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-1 focus:ring-sky-500 transition-all outline-none resize-none" rows="3" placeholder="Provide additional details about this expense..."/>
                                    </div>

                                    <button type="submit" disabled={isSubmitting}
                                        className="w-full bg-sky-500 text-white py-3.5 rounded-lg font-bold shadow-xl shadow-sky-500/40 hover:bg-sky-600 transform hover:scale-[1.005] transition-all duration-200 disabled:opacity-50">
                                        {isSubmitting ? 'Submitting...' : '🚀 Submit Expense'}
                                    </button>
                                </form>
                            </div>
                        )}

                        {/* Expense History View */}
                        {employeeTab === 'history' && <EmployeeHistory />}
                    </div>
                )}

                {/* --- Manager View --- */}
                {currentUser?.role === 'Manager' && (
                    <div className="bg-white rounded-xl shadow-xl overflow-hidden border border-gray-200">
                        <div className="bg-indigo-600 text-white px-6 py-4 flex justify-between items-center shadow-lg">
                            <h2 className="text-xl font-bold">Approval Queue (Parallel Review)</h2>
                            <button onClick={() => fetchApprovalQueue(currentUser.id)}
                                className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition font-semibold shadow-md">
                                🔄 Refresh Queue
                            </button>
                        </div>
                        {loadingQueue ? (<div className="p-12 text-center text-gray-700">Loading approvals...</div>)
                        : approvalQueue.length === 0 ? (<div className="p-12 text-center text-gray-500">No pending approvals.</div>)
                        : (
                            <div className="overflow-x-auto divide-y divide-gray-100">
                                {/* FIX: Render the custom ApprovalQueueItem component */}
                                {approvalQueue.map((expense) => (
                                    <ApprovalQueueItem
                                        key={expense.id}
                                        expense={expense}
                                        currentUser={currentUser}
                                        handleApproval={handleApproval}
                                        convertedAmounts={convertedAmounts}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* --- Admin View --- */}
                {currentUser?.role === 'Admin' && (
                    <div className="space-y-6">
                        {/* Tabs for Admin */}
                        <div className="flex border-b border-gray-300 bg-white shadow-xl rounded-xl overflow-hidden p-1">
                            {/* Expense Tab */}
                            <button key="expenses" onClick={() => { setAdminTab('expenses'); fetchAllExpenses(); }}
                                className={`flex-1 px-6 py-3 font-bold text-sm uppercase tracking-wide rounded-lg transition-all ${
                                    adminTab === 'expenses' || adminTab === 'all' || adminTab === 'pending' || adminTab === 'approved' || adminTab === 'rejected' ? 'bg-gray-800 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                📋 All Expenses
                            </button>
                            {/* User Management Tab (NEW) */}
                            <button key="users" onClick={() => { setAdminTab('users'); fetchAllUsers(); }}
                                className={`flex-1 px-6 py-3 font-bold text-sm uppercase tracking-wide rounded-lg transition-all ${
                                    adminTab === 'users' ? 'bg-gray-800 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                👥 User Management
                            </button>
                        </div>
                        
                        {/* Admin Expenses View */}
                        {(adminTab === 'expenses' || adminTab === 'all' || adminTab === 'pending' || adminTab === 'approved' || adminTab === 'rejected') && (
                            <div className="bg-white rounded-xl shadow-xl overflow-hidden border border-gray-200">
                                <div className="bg-gray-800 text-white px-6 py-4 flex justify-between items-center shadow-lg">
                                    <h2 className="text-xl font-bold">All Expenses Overview</h2>
                                    <button onClick={fetchAllExpenses}
                                        className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition font-semibold shadow-md">
                                        🔄 Refresh Data
                                    </button>
                                </div>
                                {/* Filter Tabs */}
                                <div className="flex border-b border-gray-200 px-6 bg-gray-50">
                                    {['all', 'pending', 'approved', 'rejected'].map((tab) => (
                                        <button key={tab} onClick={() => setAdminTab(tab)}
                                            className={`px-4 py-3 font-bold text-sm uppercase tracking-wide transition-all ${
                                                adminTab === tab ? 'text-sky-600 border-b-2 border-sky-600' : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                            style={{ borderBottom: adminTab === tab ? '2px solid #0284C7' : '2px solid transparent' }}
                                        >
                                            {tab === 'all' && '📋 All'}
                                            {tab === 'pending' && '⏳ Pending'}
                                            {tab === 'approved' && '✅ Approved'}
                                            {tab === 'rejected' && '❌ Rejected'}
                                        </button>
                                    ))}
                                </div>

                                {/* Expense List */}
                                {allExpenses.length === 0 ? (<div className="p-12 text-center text-gray-500">No expenses found.</div>) : (
                                    <div className="overflow-x-auto divide-y divide-gray-100">
                                        {allExpenses
                                            // FIX: Convert the expense status to lowercase for comparison, making the filter case-insensitive.
                                            .filter(exp => adminTab === 'all' || exp.status.toLowerCase() === adminTab)
                                            .map((expense) => (
                                                <div key={expense.id} className={`p-5 transition duration-200 hover:bg-gray-50`}>
                                                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                                        <div className="flex-1 space-y-2">
                                                            <div className="flex items-start gap-3">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-mono">#{expense.id}</span>
                                                                        <h3 className="text-lg font-bold text-gray-800 truncate">{expense.title}</h3>
                                                                    </div>
                                                                    <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
                                                                        <span className="font-semibold">👤 {expense.submitter_name}</span>
                                                                        <span>| {getCategoryIcon(expense.category)} {expense.category}</span>
                                                                        <span>| 📅 {new Date(expense.submitted_at).toLocaleDateString()}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-4">
                                                            <div className="bg-gray-50 px-4 py-2 rounded-lg border border-gray-200">
                                                                <p className="text-xs text-gray-500 font-medium">Amount</p>
                                                                <p className="text-xl font-bold text-blue-800">{expense.amount.toFixed(2)} {expense.currency}</p>
                                                            </div>
                                                            <div>
                                                                <span className={`px-3 py-1 inline-flex items-center text-sm font-bold rounded-full ${getStatusStyle(expense.status)} text-white shadow-sm`}>
                                                                    {expense.status}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        {allExpenses.filter(exp => adminTab === 'all' || exp.status.toLowerCase() === adminTab).length === 0 && (
                                            <div className="p-12 text-center text-gray-500">No {adminTab} expenses found</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {/* Admin User Management View (NEW) */}
                        {adminTab === 'users' && <AdminUserManagement />}
                    </div>
                )}
                
            </main>

            {/* --- Login/Registration Screen (Clean Corporate Style) --- */}
            {!currentUser && (
                <div className="fixed inset-0 flex items-center justify-center p-6 bg-gray-900 z-[100]"
                    style={{
                        backgroundImage: `linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)`,
                    }}>
                    <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-lg border-t-8 border-sky-500">
                        
                        <div className="text-center mb-8">
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-sky-500 rounded-full mb-4 shadow-lg">
                                <span className="text-3xl text-white">🏦</span>
                            </div>
                            <h1 className="text-3xl font-extrabold text-gray-900 mb-1">
                                {isRegistering ? 'CREATE EMPLOYEE ACCOUNT' : 'EXPENSE MANAGER LOGIN'}
                            </h1>
                            <p className="text-gray-500 font-medium">Access your secure financial tracking portal.</p>
                        </div>

                        {isRegistering ? (
                            /* --- Registration Form --- */
                            <form onSubmit={handleRegistration} className="space-y-4">
                                {['name', 'email', 'password'].map(field => (
                                    <div key={field}>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2 capitalize">{field} *</label>
                                        <input type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'}
                                            value={regForm[field]} onChange={(e) => setRegForm({...regForm, [field]: e.target.value})}
                                            className="w-full px-4 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all outline-none" 
                                            placeholder={`Enter your ${field}`} required/>
                                    </div>
                                ))}

                                {regError && (<div className="bg-red-100 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-lg"><span className="font-medium">⚠️ {regError}</span></div>)}
                                
                                <button type="submit" disabled={isRegLoading}
                                    className="w-full bg-sky-500 text-white py-3.5 rounded-lg font-bold text-lg shadow-md shadow-sky-500/50 hover:bg-sky-600 transition-all duration-200 disabled:opacity-50 mt-4">
                                    {isRegLoading ? 'Registering...' : 'Create Account'}
                                </button>
                                <p className="text-center text-sm text-gray-600 mt-4">
                                    Already have an account? <span className="font-bold text-sky-600 cursor-pointer hover:text-sky-500" onClick={() => setIsRegistering(false)}>Log In</span>
                                </p>
                            </form>
                        ) : (
                            /* --- Login Form --- */
                            <form onSubmit={handleLogin} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address *</label>
                                    <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all outline-none" placeholder="user@company.com" required/>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Password *</label>
                                    <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg placeholder-gray-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all outline-none" placeholder="Enter your password" required/>
                                </div>

                                {loginError && (<div className="bg-red-100 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-lg"><span className="font-medium">⚠️ {loginError}</span></div>)}

                                <button type="submit" disabled={isLoading}
                                    className="w-full bg-sky-500 text-white py-3.5 rounded-lg font-bold text-lg shadow-md shadow-sky-500/50 hover:bg-sky-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
                                    {isLoading ? (<span className="flex items-center justify-center"><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Signing in...</span>) : ('Sign In')}
                                </button>
                                <p className="text-center text-sm text-gray-600 mt-4">
                                    Need an account? <span className="font-bold text-sky-600 cursor-pointer hover:text-sky-500" onClick={() => setIsRegistering(true)}>Create Account</span>
                                </p>
                            </form>
                        )}
                        
                        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
                            <p className="text-sm text-gray-500 font-semibold mb-3">Demo Credentials (Password is plaintext)</p>
                            <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 font-medium">
                                <span className="font-bold text-center text-indigo-600">Admin: admin123</span>
                                <span className="font-bold text-center text-indigo-600">Manager 1: manager123</span>
                                <span className="font-bold text-center text-indigo-600">Emp 1: emp123</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Footer */}
            <footer className="max-w-7xl mx-auto px-4 py-8 text-center text-gray-500 text-sm">
                <p className="font-medium">💼 EXPENSE MANAGER v2.0 - High-Trust Financial Theme</p>
                <p className="mt-1">Features: Registration, Parallel Approval, User Management</p>
            </footer>
            
            <MessageToast message={toastMessage} type={toastType} onClose={() => setToastMessage(null)} />
        </div>
    );
}

export default App;
