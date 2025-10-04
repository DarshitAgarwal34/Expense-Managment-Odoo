import os

class Config:
    """Application configuration"""
    SQLALCHEMY_DATABASE_URI = 'sqlite:///expense_management.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'hackathon-secret-key-2024'
    COMPANY_BASE_CURRENCY = 'USD'  # Default company currency for demo