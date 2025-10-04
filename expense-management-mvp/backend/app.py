from flask import Flask, request, jsonify
from flask_cors import CORS
from models import db, Company, User, Expense, ApprovalStep
from config import Config
from datetime import datetime
import requests
import os
import time # Imported for potential exponential backoff in currency fetch

# --- App Initialization ---
app = Flask(__name__)
# Load configuration from config.py (Config is assumed to be imported from config.py)
app.config.from_object(Config)

# Initialize extensions
db.init_app(app)
CORS(app) # Enables communication with the React frontend

# --- Data Seeding Function ---

def seed_demo_data():
    """Create demo data for hackathon presentation with unique passwords."""
    
    # NOTE: db.drop_all() and db.create_all() are run in the __main__ block
    # to ensure they are executed once outside of the web request lifecycle.
    
    print("Seeding demo data...")
    
    # Get today's date once for seeding expenses
    today = datetime.utcnow().date()
    
    # Create Company
    company = Company(name='TechCorp Inc.', base_currency='USD')
    db.session.add(company)
    db.session.flush()  # Get company.id
    
    # --- Create Users with Unique Passwords (The Fix) ---
    # Passwords stored as plaintext for hackathon demo simplicity.
    
    # Create Admin
    admin = User(
        email='admin@company.com',
        password='admin123',        # <-- Unique Password
        name='Harshit Admin', 
        role='Admin',
        company_id=company.id
    )
    db.session.add(admin)
    db.session.flush()
    
    # Create Manager (Sequence 1 Approver)
    manager = User(
        email='manager@company.com',
        password='manager123',      # <-- Unique Password
        name='Darshit Manager',
        role='Manager',
        company_id=company.id,
        manager_id=admin.id          # Reports to Admin for potential Seq 2
    )
    db.session.add(manager)
    db.session.flush()  # Get manager.id
    
    # Create Employees
    employee1 = User(
        email='employee1@company.com',
        password='emp123',         # <-- Unique Password
        name='Rahul Employee',
        role='Employee',
        company_id=company.id,
        manager_id=manager.id
    )
    
    employee2 = User(
        email='employee2@company.com',
        password='emp1234',
        name='Anubhav employee',
        role='Employee',
        company_id=company.id,
        manager_id=manager.id
    )
    
    db.session.add_all([employee1, employee2])
    db.session.flush()
    
    # --- Create Sample Expenses ---
    
    # Expense 1: Pending (waiting for manager approval)
    expense1 = Expense(
        user_id=employee1.id,
        company_id=company.id,
        title='Client Lunch Meeting',
        description='Lunch with potential client to discuss Q4 project',
        amount=85.50,
        currency='USD',
        category='Meals',
        date=today, # <-- FIX: Added date for new model schema
        status='Pending'
    )
    db.session.add(expense1)
    db.session.flush()
    
    # Create first approval step for expense1
    step1 = ApprovalStep(
        expense_id=expense1.id,
        approver_id=manager.id,
        sequence=1,
        status='Waiting'
    )
    db.session.add(step1)
    
    # Expense 2: Pending (in EUR, waiting for manager) - Used to test currency conversion
    expense2 = Expense(
        user_id=employee2.id,
        company_id=company.id,
        title='Conference Travel',
        description='Flight and hotel for React Summit 2024',
        amount=450.00,
        currency='EUR',
        category='Travel',
        date=today, # <-- FIX: Added date for new model schema
        status='Pending'
    )
    db.session.add(expense2)
    db.session.flush()
    
    step2 = ApprovalStep(
        expense_id=expense2.id,
        approver_id=manager.id,
        sequence=1,
        status='Waiting'
    )
    db.session.add(step2)
    
    # Expense 3: Already approved (for demo history)
    expense3 = Expense(
        user_id=employee1.id,
        company_id=company.id,
        title='Office Supplies',
        description='Keyboard and mouse',
        amount=120.00,
        currency='USD',
        category='Office Supplies',
        date=today, # <-- FIX: Added date for new model schema
        status='Approved'
    )
    db.session.add(expense3)
    db.session.flush()
    
    step3 = ApprovalStep(
        expense_id=expense3.id,
        approver_id=manager.id,
        sequence=1,
        status='Approved',
        comments='Approved - standard supplies',
        decided_at=datetime.utcnow()
    )
    db.session.add(step3)
    
    db.session.commit()
    print("Demo data seeded successfully!")


# --- Utility Functions ---

def get_exchange_rate(from_currency, to_currency):
    """Fetches exchange rate using external API with exponential backoff."""
    if from_currency == to_currency:
        return 1.0
    
    # Use exponential backoff for professional error handling
    for attempt in range(3):
        try:
            # API: https://api.exchangerate-api.com/v4/latest/{BASE_CURRENCY}
            url = f"https://api.exchangerate-api.com/v4/latest/{from_currency}"
            response = requests.get(url, timeout=5)
            response.raise_for_status()
            data = response.json()
            
            if to_currency in data['rates']:
                rate = data['rates'].get(to_currency)
                # Since the API often gives BASE_to_X, and we want X_to_BASE (USD),
                # we return the rate so the client can calculate correctly.
                return rate
            else:
                return None
                
        except requests.RequestException as e:
            if attempt < 2:
                print(f"API request failed (Attempt {attempt+1}): {e}. Retrying...")
                time.sleep(2 ** attempt)
            else:
                print(f"Failed to get exchange rate after 3 attempts.")
                return None
    return None

# ==================== API ENDPOINTS ====================

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Simple authentication endpoint for demo (using plaintext password check)"""
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400
    
    # WARNING: Insecure! Plaintext password storage is only for hackathon demo purposes. Do NOT use in production.
    user = User.query.filter_by(email=email, password=password).first()
    
    if not user:
        return jsonify({'error': 'Invalid credentials'}), 401
    
    return jsonify({
        'success': True,
        'user': user.to_dict()
    }), 200


@app.route('/api/auth/register', methods=['POST'])
def register():
    """Register a new user (default to Employee)"""
    data = request.json
    
    # Validate required fields
    required_fields = ['name', 'email', 'password']
    for field in required_fields:
        if field not in data:
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    # Check if user already exists
    existing_user = User.query.filter_by(email=data['email']).first()
    if existing_user:
        return jsonify({'error': 'User with this email already exists'}), 400
    
    # Create new user (default to Employee role for demo)
    user = User(
        name=data['name'],
        email=data['email'],
        password=data['password'],
        role='Employee',
        company_id=1  # Default to first company for demo
    )
    
    db.session.add(user)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'user': user.to_dict()
    }), 201

# --- ADMIN USER MANAGEMENT ENDPOINTS ---

@app.route('/api/users', methods=['GET'])
def get_all_users():
    """Get all users (for Admin User Management view)"""
    users = User.query.all()
    # Need to convert manager_id to manager_name for display
    users_data = []
    manager_map = {u.id: u.name for u in users if u.role in ['Manager', 'Admin']}

    for user in users:
        user_dict = user.to_dict()
        user_dict['manager_name'] = manager_map.get(user.manager_id, 'N/A')
        users_data.append(user_dict)

    return jsonify({
        'success': True,
        'users': users_data
    }), 200


@app.route('/api/admin/users/create', methods=['POST'])
def create_user_by_admin():
    """Admin endpoint to create a new user (Employee or Manager)"""
    data = request.json
    
    required_fields = ['name', 'email', 'password', 'role', 'company_id']
    for field in required_fields:
        if field not in data:
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    if data['role'] not in ['Employee', 'Manager', 'Admin']:
        return jsonify({'error': 'Invalid role specified'}), 400

    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'User with this email already exists'}), 400

    # Ensure manager_id is valid if provided
    manager_id = data.get('manager_id')
    if manager_id:
        manager = User.query.get(manager_id)
        if not manager or manager.role not in ['Manager', 'Admin']:
             return jsonify({'error': 'Invalid manager_id provided'}), 400

    user = User(
        name=data['name'],
        email=data['email'],
        password=data['password'], # WARNING: plaintext
        role=data['role'],
        company_id=data['company_id'],
        manager_id=manager_id
    )

    db.session.add(user)
    db.session.commit()

    return jsonify({
        'success': True,
        'user': user.to_dict()
    }), 201


@app.route('/api/admin/users/<int:user_id>', methods=['PUT'])
def update_user_by_admin(user_id):
    """Admin endpoint to update user details (role, manager, name)"""
    data = request.json
    user = User.query.get(user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    # Update fields if present in data
    if 'name' in data:
        user.name = data['name']
    
    if 'email' in data:
        # Check if new email is unique (excluding self)
        if User.query.filter(User.email == data['email'], User.id != user_id).first():
             return jsonify({'error': 'Email already in use'}), 400
        user.email = data['email']
    
    if 'role' in data and data['role'] in ['Employee', 'Manager', 'Admin']:
        user.role = data['role']
    
    if 'manager_id' in data:
        manager_id = data['manager_id']
        if manager_id is not None:
            # Check if manager is valid
            manager = User.query.get(manager_id)
            if not manager or manager.role not in ['Manager', 'Admin']:
                return jsonify({'error': 'Invalid manager_id provided'}), 400
        user.manager_id = manager_id
    
    if 'password' in data and data['password']:
         # WARNING: plaintext update
        user.password = data['password']

    db.session.commit()

    return jsonify({
        'success': True,
        'user': user.to_dict()
    }), 200


@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
def delete_user_by_admin(user_id):
    """Admin endpoint to delete a user"""
    user = User.query.get(user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    if user.role == 'Admin' and User.query.filter_by(role='Admin').count() == 1:
        return jsonify({'error': 'Cannot delete the last Admin user'}), 400

    # Before deletion, reassign direct reports to the Admin (id=1) for safety
    admin_user = User.query.filter_by(role='Admin').first()
    if admin_user:
        User.query.filter_by(manager_id=user_id).update({'manager_id': admin_user.id})
    
    # Cascade deletes should handle ApprovalSteps and Expenses submitted by this user
    # (Expense model cascade ensures ApprovalSteps are deleted, but submitted expenses remain)
    
    db.session.delete(user)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'User {user_id} deleted successfully.'
    }), 200

# --- END ADMIN USER MANAGEMENT ENDPOINTS ---

@app.route('/api/expenses', methods=['POST'])
def submit_expense():
    """Submit a new expense and initialize approval workflow"""
    data = request.json
    
    # Validate required fields
    required_fields = ['user_id', 'title', 'amount', 'currency']
    for field in required_fields:
        if field not in data:
            return jsonify({'error': f'Missing required field: {field}'}), 400
    
    # Get the submitting user to find their manager
    user = User.query.get(data['user_id'])
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    # Create the expense
    # Parse date from frontend, fallback to current UTC date if missing or malformed
    date_str = data.get('date')
    try:
        if date_str:
            date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
        else:
            date_obj = datetime.utcnow().date()
    except (ValueError, TypeError):
        # This fallback is now correctly used if the frontend date is invalid
        date_obj = datetime.utcnow().date()

    expense = Expense(
        user_id=data['user_id'],
        company_id=user.company_id,
        title=data['title'],
        description=data.get('description', ''),
        amount=float(data['amount']),
        currency=data['currency'],
        category=data.get('category', 'Other'),
        date=date_obj, # This line now works correctly as the model has the 'date' field.
        status='Pending'
    )
    
    db.session.add(expense)
    db.session.flush()  # Get expense.id
    
    # Initialize the first approval step (manager approval)
    if user.manager_id:
        first_step = ApprovalStep(
            expense_id=expense.id,
            approver_id=user.manager_id,
            sequence=1,
            status='Waiting'
        )
        db.session.add(first_step)
    else:
        # If no manager, auto-approve (edge case for demo)
        expense.status = 'Approved'
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'expense': expense.to_dict(include_steps=True)
    }), 201


@app.route('/api/approvals/<int:user_id>', methods=['GET'])
def get_approval_queue(user_id):
    """Get expenses waiting for this user's approval"""
    
    # Find all approval steps where this user is the approver and status is 'Waiting'
    waiting_steps = ApprovalStep.query.filter_by(
        approver_id=user_id,
        status='Waiting'
    ).all()
    
    # Build response with expense details
    approval_queue = []
    for step in waiting_steps:
        # Before adding, check if there is an earlier step that is NOT approved/rejected (Sequential Check)
        preceding_step_pending = ApprovalStep.query.filter(
            ApprovalStep.expense_id == step.expense_id,
            ApprovalStep.sequence < step.sequence,
            ApprovalStep.status != 'Approved'
        ).first()

        # Only add to queue if this is the first step OR the preceding step has been approved.
        if not preceding_step_pending:
            expense_data = step.expense.to_dict()
            expense_data['approval_step_id'] = step.id
            expense_data['approval_sequence'] = step.sequence
            approval_queue.append(expense_data)
    
    return jsonify({
        'success': True,
        'approvals': approval_queue
    }), 200


@app.route('/api/approvals/<int:step_id>', methods=['PUT'])
def process_approval(step_id):
    """Approve or reject an approval step with sequential logic"""
    data = request.json
    decision = data.get('decision')  # 'approved' or 'rejected'
    comments = data.get('comments', '')
    
    if decision not in ['approved', 'rejected']:
        return jsonify({'error': 'Decision must be "approved" or "rejected"'}), 400
    
    # Get the approval step
    step = ApprovalStep.query.get(step_id)
    if not step:
        return jsonify({'error': 'Approval step not found'}), 404
    
    if step.status != 'Waiting':
        return jsonify({'error': 'This approval has already been processed'}), 400
    
    # Update the current step
    step.status = 'Approved' if decision == 'approved' else 'Rejected'
    step.comments = comments
    step.decided_at = datetime.utcnow()
    
    expense = step.expense
    
    if decision == 'rejected':
        # If rejected, set entire expense to rejected and terminate workflow
        expense.status = 'Rejected'
    else:
        # If approved, check for next approver in sequence
        
        next_sequence = step.sequence + 1
        
        # --- Sequential Approval Logic ---
        
        # Check for the next defined approval step (e.g., Director, Admin)
        # For the MVP, we assume the next step is Admin if the amount is high.
        
        next_step = ApprovalStep.query.filter(
            ApprovalStep.expense_id == expense.id,
            ApprovalStep.sequence == next_sequence
        ).first()

        if next_step:
            # Check for conditional escalation here (e.g., if > $500, go to Admin)
            admin = User.query.filter_by(company_id=expense.company_id, role='Admin').first()

            # Simple escalation check: If current step was Manager (seq 1) and amount > 500, escalate.
            if step.sequence == 1 and expense.amount > 500 and admin:
                # Update the existing next_step approver to be the Admin for seq 2 (if not already set)
                # In the current seeder, there is no pre-defined Seq 2, so we create it if needed.
                
                # For this simple MVP, we will only check if there is a next step
                # and leave the sequence logic simple: just activate the next step.
                
                # Check if we need to manually create the next step (Admin)
                if not next_step:
                    # If we decide to escalate to Admin (id=1 is Admin) if amount > 500
                    if expense.amount > 500 and admin and admin.id != step.approver_id:
                        new_step = ApprovalStep(
                            expense_id=expense.id,
                            approver_id=admin.id,
                            sequence=next_sequence,
                            status='Waiting'
                        )
                        db.session.add(new_step)
                        expense.status = 'Pending'
                    else:
                        # No escalation needed, finalize approval
                        expense.status = 'Approved'
                
                # If a next step was already planned (e.g., pre-seeded as Director)
                else:
                    # Mark expense as pending and wait for the pre-defined next step
                    expense.status = 'Pending'
            
            # If sequence 1 was low amount, or if this step was already Admin (final step)
            else:
                # No further step defined/needed based on simple logic, finalize approval
                expense.status = 'Approved'
        else:
            # No next step found in the database, expense is fully approved
            expense.status = 'Approved'
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'expense': expense.to_dict(include_steps=True)
    }), 200


@app.route('/api/utility/currency', methods=['GET'])
def convert_currency():
    """Convert currency using external API"""
    from_currency = request.args.get('from')
    to_currency = request.args.get('to')
    amount = request.args.get('amount', type=float)

    if not all([from_currency, to_currency, amount]):
        return jsonify({'success': False, 'error': 'Missing parameters: from, to, amount'}), 400
    
    rate = get_exchange_rate(from_currency, to_currency)
    
    if rate is not None:
        # Conversion Formula: Converted Amount = Original Amount * Rate
        converted_amount = amount * rate
        
        return jsonify({
            'success': True,
            'from_currency': from_currency,
            'to_currency': to_currency,
            'original_amount': amount,
            'converted_amount': round(converted_amount, 2),
            'conversion_rate': rate
        }), 200
        
    return jsonify({'success': False, 'error': f'Currency conversion failed for {from_currency} to {to_currency}'}), 500


@app.route('/api/expenses/<int:expense_id>', methods=['GET'])
def get_expense_details(expense_id):
    """Get detailed information about a specific expense"""
    expense = Expense.query.get(expense_id)
    
    if not expense:
        return jsonify({'success': False, 'error': 'Expense not found'}), 404
    
    return jsonify({
        'success': True,
        'expense': expense.to_dict(include_steps=True)
    }), 200


@app.route('/api/expenses/history/<int:user_id>', methods=['GET'])
def get_user_expense_history(user_id):
    """Get expense history for a specific user"""
    expenses = Expense.query.filter_by(user_id=user_id).order_by(Expense.submitted_at.desc()).all()
    
    return jsonify({
        'success': True,
        'expenses': [exp.to_dict() for exp in expenses]
    }), 200


@app.route('/api/expenses/all', methods=['GET'])
def get_all_expenses():
    """Get all expenses (for admin view) with pagination"""
    # Note: user_id logic for filtering is disabled for the simple Admin 'all' view.

    # Get pagination parameters from query string
    page = request.args.get('page', default=1, type=int)
    per_page = request.args.get('per_page', default=20, type=int)

    pagination = Expense.query.paginate(page=page, per_page=per_page, error_out=False)
    expenses = pagination.items

    return jsonify({
        'success': True,
        'expenses': [exp.to_dict() for exp in expenses],
        'page': page,
        'per_page': per_page,
        'total': pagination.total,
        'pages': pagination.pages
    }), 200


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'Expense Management API is running'
    }), 200


# ==================== APP INITIALIZATION (The Final Fix) ====================

if __name__ == '__main__':
    # Set up the database and seed demo data before running the app
    with app.app_context():
        db.drop_all()
        db.create_all()
        seed_demo_data()
    # Run the app
    app.run(debug=True, port=5000)
