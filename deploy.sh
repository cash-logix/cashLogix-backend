#!/bin/bash

# Cash Logix Backend AWS Deployment Script
# This script automates the deployment process to AWS ECS

set -e

# Configuration
AWS_REGION=${AWS_REGION:-us-east-1}
ECR_REPOSITORY=${ECR_REPOSITORY:-cash-logix-backend}
IMAGE_TAG=${IMAGE_TAG:-latest}
ENVIRONMENT=${ENVIRONMENT:-production}
STACK_NAME=${STACK_NAME:-cash-logix-backend}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    if ! command -v aws &> /dev/null; then
        error "AWS CLI is not installed. Please install it first."
    fi
    
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install it first."
    fi
    
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed. Please install it first."
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        error "AWS credentials not configured. Run 'aws configure' first."
    fi
    
    log "Prerequisites check passed!"
}

# Get AWS account ID
get_aws_account_id() {
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    log "AWS Account ID: $AWS_ACCOUNT_ID"
}

# Create ECR repository if it doesn't exist
create_ecr_repository() {
    log "Checking ECR repository..."
    
    if aws ecr describe-repositories --repository-names $ECR_REPOSITORY --region $AWS_REGION &> /dev/null; then
        log "ECR repository $ECR_REPOSITORY already exists"
    else
        log "Creating ECR repository $ECR_REPOSITORY..."
        aws ecr create-repository --repository-name $ECR_REPOSITORY --region $AWS_REGION
        log "ECR repository created successfully"
    fi
}

# Build and push Docker image
build_and_push_image() {
    log "Building Docker image..."
    
    # Build image
    docker build -t $ECR_REPOSITORY:$IMAGE_TAG .
    
    # Get login token
    log "Logging into ECR..."
    aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
    
    # Tag image
    docker tag $ECR_REPOSITORY:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG
    
    # Push image
    log "Pushing image to ECR..."
    docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG
    
    log "Image pushed successfully!"
}

# Deploy CloudFormation stack
deploy_infrastructure() {
    log "Deploying infrastructure with CloudFormation..."
    
    # Check if stack exists
    if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $AWS_REGION &> /dev/null; then
        log "Updating existing CloudFormation stack..."
        aws cloudformation update-stack \
            --template-body file://cloudformation-template.yaml \
            --stack-name $STACK_NAME \
            --parameters ParameterKey=Environment,ParameterValue=$ENVIRONMENT \
            --capabilities CAPABILITY_IAM \
            --region $AWS_REGION
    else
        log "Creating new CloudFormation stack..."
        aws cloudformation create-stack \
            --template-body file://cloudformation-template.yaml \
            --stack-name $STACK_NAME \
            --parameters ParameterKey=Environment,ParameterValue=$ENVIRONMENT \
            --capabilities CAPABILITY_IAM \
            --region $AWS_REGION
    fi
    
    # Wait for stack to complete
    log "Waiting for CloudFormation stack to complete..."
    aws cloudformation wait stack-update-complete --stack-name $STACK_NAME --region $AWS_REGION || \
    aws cloudformation wait stack-create-complete --stack-name $STACK_NAME --region $AWS_REGION
    
    log "Infrastructure deployment completed!"
}

# Update ECS service
update_ecs_service() {
    log "Updating ECS service..."
    
    CLUSTER_NAME="cash-logix-$ENVIRONMENT"
    SERVICE_NAME="cash-logix-backend-$ENVIRONMENT"
    
    # Force new deployment
    aws ecs update-service \
        --cluster $CLUSTER_NAME \
        --service $SERVICE_NAME \
        --force-new-deployment \
        --region $AWS_REGION
    
    log "ECS service update initiated!"
}

# Get deployment status
get_deployment_status() {
    log "Getting deployment status..."
    
    CLUSTER_NAME="cash-logix-$ENVIRONMENT"
    SERVICE_NAME="cash-logix-backend-$ENVIRONMENT"
    
    # Get service status
    aws ecs describe-services \
        --cluster $CLUSTER_NAME \
        --services $SERVICE_NAME \
        --region $AWS_REGION \
        --query 'services[0].{Status:status,RunningCount:runningCount,DesiredCount:desiredCount,TaskDefinition:taskDefinition}' \
        --output table
    
    # Get load balancer URL
    LOAD_BALANCER_DNS=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $AWS_REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerURL`].OutputValue' \
        --output text)
    
    if [ ! -z "$LOAD_BALANCER_DNS" ]; then
        log "Application URL: $LOAD_BALANCER_DNS"
        log "Health check: $LOAD_BALANCER_DNS/health"
    fi
}

# Main deployment function
main() {
    log "Starting Cash Logix Backend AWS Deployment..."
    
    check_prerequisites
    get_aws_account_id
    create_ecr_repository
    build_and_push_image
    deploy_infrastructure
    update_ecs_service
    
    log "Deployment completed successfully!"
    get_deployment_status
}

# Run main function
main "$@"
