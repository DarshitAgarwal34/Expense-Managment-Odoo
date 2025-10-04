from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Company(db.Model):
    """Company/Organization model"""
    __tablename__ = 'companies'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    base_currency = db.Column(db.String(3), default='USD')  # ISO 4217 currency code
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    users = db.relationship('User', backref='company', lazy=True)
    expenses = db.relationship('Expense', backref='company', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'base_currency': self.base_currency
        }


class User(db.Model):
    """User model with role-based access"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)  # In production, hash this!
    name = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # 'Admin', 'Manager', 'Employee'
    company_id = db.Column(db.Integer, db.ForeignKey('companies.id'), nullable=False)
    
    # Self-referential relationship: Each user can have one manager
    manager_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    manager = db.relationship('User', remote_side=[id], backref='direct_reports')
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    submitted_expenses = db.relationship('Expense', backref='submitter', lazy=True, foreign_keys='Expense.user_id')
    approval_steps = db.relationship('ApprovalStep', backref='approver', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'name': self.name,
            'role': self.role,
            'company_id': self.company_id,
            'manager_id': self.manager_id
        }


class Expense(db.Model):
    """Expense submission model"""
    __tablename__ = 'expenses'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    company_id = db.Column(db.Integer, db.ForeignKey('companies.id'), nullable=False)
    
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    amount = db.Column(db.Float, nullable=False)
    currency = db.Column(db.String(3), nullable=False)  # Currency of the expense
    category = db.Column(db.String(50))  # e.g., 'Travel', 'Meals', 'Office Supplies'
    
    status = db.Column(db.String(20), default='Pending')  # 'Pending', 'Approved', 'Rejected'
    submitted_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    approval_steps = db.relationship('ApprovalStep', backref='expense', lazy=True, cascade='all, delete-orphan')

    def to_dict(self, include_steps=False):
        result = {
            'id': self.id,
            'user_id': self.user_id,
            'submitter_name': self.submitter.name if self.submitter else None,
            'title': self.title,
            'description': self.description,
            'amount': self.amount,
            'currency': self.currency,
            'category': self.category,
            'status': self.status,
            'submitted_at': self.submitted_at.isoformat()
        }
        
        if include_steps:
            result['approval_steps'] = [step.to_dict() for step in self.approval_steps]
        
        return result


class ApprovalStep(db.Model):
    """Sequential approval workflow step"""
    __tablename__ = 'approval_steps'
    
    id = db.Column(db.Integer, primary_key=True)
    expense_id = db.Column(db.Integer, db.ForeignKey('expenses.id'), nullable=False)
    approver_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    sequence = db.Column(db.Integer, nullable=False)  # Order of approval (1, 2, 3...)
    status = db.Column(db.String(20), default='Waiting')  # 'Waiting', 'Approved', 'Rejected'
    comments = db.Column(db.Text)
    decided_at = db.Column(db.DateTime)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'expense_id': self.expense_id,
            'approver_id': self.approver_id,
            'approver_name': self.approver.name if self.approver else None,
            'sequence': self.sequence,
            'status': self.status,
            'comments': self.comments,
            'decided_at': self.decided_at.isoformat() if self.decided_at else None
        }