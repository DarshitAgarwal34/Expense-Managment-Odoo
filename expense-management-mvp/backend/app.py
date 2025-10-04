from flask import Flask, request, jsonify
from flask_cors import CORS
from models import db, Company, User, Expense, ApprovalStep
from config import Config
from datetime import datetime
import requests

app = Flask(__name__)
app.config.from_object(Config)

# Initialize extensions
db.init_app(app)
CORS(app)  # Enable CORS for frontend communication


def seed_demo_data():
    """Create demo data for hackathon presentation"""
    
    # Check if data already exists
    if User.query.first() is not None:
        print("Demo data already exists. Skipping seed.")
        return
    
    print("Seeding demo data...")
    
    # Create Company
    company = Company(name='TechCorp Inc.', base_currency='USD')
    db.session.add(company)
    db.session.flush()  # Get company.id
    
    # Create Admin
    admin = User(
        email='admin@company.com',
        password='admin123',
        name='Alice Admin',
        role='Admin',
        company_id=company.id
    )
    db.session.add(admin)
    
    # Create Manager
    manager = User(
        email='manager@company.com',
        password='manager123',
        name='Bob Manager',
        role='Manager',
        company_id=company.id,
        manager_id=None  # Reports to admin (or no one for demo)
    )
    db.session.add(manager)
    db.session.flush()  # Get manager.id
    
    # Create Employees
    employee1 = User(
        email='employee1@company.com',
        password='emp123',
        name='Charlie Employee',
        role='Employee',
        company_id=company.id,
        manager_id=manager.id
    )
    
    employee2 = User(
        email='employee2@company.com',
        password='emp123',
        name='Diana Developer',
        role='Employee',
        company_id=company.id,
        manager_id=manager.id
    )
    
    db.session.add_all([employee1, employee2])
    db.session.flush()
    
    # Create Sample Expenses
    
    # Expense 1: Pending (waiting for manager approval)
    expense1 = Expense(
        user_id=employee1.id,
        company_id=company.id,
        title='Client Lunch Meeting',
        description='Lunch with potential client to discuss Q4 project',
        amount=85.50,
        currency='USD',
        category='Meals',
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
    
    # Expense 2: Pending (in EUR, waiting for manager)
    expense2 = Expense(
        user_id=employee2.id,
        company_id=company.id,
        title='Conference Travel',
        description='Flight and hotel for React Summit 2024',
        amount=450.00,
        currency='EUR',
        category='Travel',
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


# ==================== API ENDPOINTS ====================

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Simple authentication endpoint for demo"""
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400
    
    user = User.query.filter_by(email=email, password=password).first()
    
    if not user:
        return jsonify({'error': 'Invalid credentials'}), 401
    
    return jsonify({
        'success': True,
        'user': user.to_dict()
    }), 200


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
    expense = Expense(
        user_id=data['user_id'],
        company_id=user.company_id,
        title=data['title'],
        description=data.get('description', ''),
        amount=float(data['amount']),
        currency=data['currency'],
        category=data.get('category', 'Other'),
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
        # If rejected, set entire expense to rejected
        expense.status = 'Rejected'
    else:
        # If approved, check for next approver in sequence
        # For demo: Manager is sequence 1, Admin could be sequence 2
        
        # Check if there's a defined next sequence
        next_sequence = step.sequence + 1
        
        # For this MVP, we'll implement: Manager (seq 1) -> Admin (seq 2)
        # Find an admin user if this was manager approval
        if step.sequence == 1:
            # Look for an admin in the same company
            admin = User.query.filter_by(
                company_id=expense.company_id,
                role='Admin'
            ).first()
            
            if admin and expense.amount > 500:  # Only escalate to admin if > $500
                # Create next approval step for admin
                next_step = ApprovalStep(
                    expense_id=expense.id,
                    approver_id=admin.id,
                    sequence=next_sequence,
                    status='Waiting'
                )
                db.session.add(next_step)
                expense.status = 'Pending'  # Still pending admin approval
            else:
                # No further approval needed, mark as approved
                expense.status = 'Approved'
        else:
            # This was final approval (admin level)
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
        return jsonify({'error': 'Missing parameters: from, to, amount'}), 400
    
    try:
        # Call external exchange rate API
        response = requests.get(
            f'https://api.exchangerate-api.com/v4/latest/{from_currency}',
            timeout=5
        )
        response.raise_for_status()
        
        rates = response.json().get('rates', {})
        
        if to_currency not in rates:
            return jsonify({'error': f'Currency {to_currency} not found'}), 404
        
        conversion_rate = rates[to_currency]
        converted_amount = amount * conversion_rate
        
        return jsonify({
            'success': True,
            'from_currency': from_currency,
            'to_currency': to_currency,
            'original_amount': amount,
            'converted_amount': round(converted_amount, 2),
            'conversion_rate': conversion_rate
        }), 200
        
    except requests.RequestException as e:
        return jsonify({'error': f'Currency conversion failed: {str(e)}'}), 500


@app.route('/api/expenses/<int:expense_id>', methods=['GET'])
def get_expense_details(expense_id):
    """Get detailed information about a specific expense"""
    expense = Expense.query.get(expense_id)
    
    if not expense:
        return jsonify({'error': 'Expense not found'}), 404
    
    return jsonify({
        'success': True,
        'expense': expense.to_dict(include_steps=True)
    }), 200


@app.route('/api/expenses/all', methods=['GET'])
def get_all_expenses():
    """Get all expenses (for admin view)"""
    user_id = request.args.get('user_id', type=int)
    
    if user_id:
        # Filter by user
        expenses = Expense.query.filter_by(user_id=user_id).all()
    else:
        # Get all expenses
        expenses = Expense.query.all()
    
    return jsonify({
        'success': True,
        'expenses': [exp.to_dict() for exp in expenses]
    }), 200


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'Expense Management API is running'
    }), 200


# ==================== APP INITIALIZATION ====================

if __name__ == '__main__':
    with app.app_context():
        # Create tables
        db.create_all()
        
        # Seed demo data
        seed_demo_data()
    
    # Run the app
    app.run(debug=True, port=5000)