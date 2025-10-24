# AWS Deployment Configuration for Cash Logix Backend

## Overview

This directory contains all necessary files to deploy the Cash Logix Backend to AWS using ECS Fargate, Application Load Balancer, and CloudFormation.

## Files Description

### Core Deployment Files

- `Dockerfile` - Container configuration for the Node.js application
- `.dockerignore` - Files to exclude from Docker build context
- `env.production` - Production environment variables template
- `ecs-task-definition.json` - ECS task definition for Fargate
- `cloudformation-template.yaml` - Infrastructure as Code template
- `deploy.sh` - Automated deployment script
- `deploy-aws.sh` - Manual deployment instructions

## Prerequisites

### 1. AWS Account Setup

- AWS Account with appropriate permissions
- AWS CLI installed and configured
- Docker installed and running
- Node.js 18+ installed

### 2. Required AWS Services

- ECS (Elastic Container Service)
- ECR (Elastic Container Registry)
- Application Load Balancer
- CloudFormation
- Systems Manager Parameter Store
- CloudWatch Logs
- VPC and Subnets

### 3. External Services

- MongoDB Atlas or AWS DocumentDB
- AWS SES for email services
- SSL Certificate (optional, for HTTPS)

## Quick Start

### 1. Configure Environment Variables

```bash
# Copy and edit the production environment file
cp env.production .env.production
# Edit .env.production with your actual values
```

### 2. Store Secrets in AWS Systems Manager

```bash
# MongoDB URI
aws ssm put-parameter \
  --name "/cash-logix/mongodb-uri" \
  --value "your-mongodb-connection-string" \
  --type "SecureString"

# JWT Secret
aws ssm put-parameter \
  --name "/cash-logix/jwt-secret" \
  --value "your-jwt-secret" \
  --type "SecureString"
```

### 3. Deploy Infrastructure

```bash
# Make script executable (Linux/Mac)
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

## Manual Deployment Steps

### 1. Create ECR Repository

```bash
aws ecr create-repository --repository-name cash-logix-backend --region us-east-1
```

### 2. Build and Push Docker Image

```bash
# Get login token
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build image
docker build -t cash-logix-backend:latest .

# Tag and push
docker tag cash-logix-backend:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/cash-logix-backend:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/cash-logix-backend:latest
```

### 3. Deploy CloudFormation Stack

```bash
aws cloudformation deploy \
  --template-file cloudformation-template.yaml \
  --stack-name cash-logix-backend \
  --parameter-overrides \
    Environment=production \
    VpcId=vpc-xxxxxxxxx \
    SubnetIds=subnet-xxxxxxxxx,subnet-yyyyyyyyy \
  --capabilities CAPABILITY_IAM
```

## Configuration

### Environment Variables

All sensitive configuration should be stored in AWS Systems Manager Parameter Store:

- `/cash-logix/mongodb-uri` - MongoDB connection string
- `/cash-logix/jwt-secret` - JWT signing secret
- `/cash-logix/email-user` - SES SMTP username
- `/cash-logix/email-pass` - SES SMTP password

### Infrastructure Configuration

The CloudFormation template creates:

- ECS Cluster with Fargate
- Application Load Balancer
- ECS Service with auto-scaling
- Security Groups
- IAM Roles
- CloudWatch Log Groups

## Monitoring and Logs

### View Application Logs

```bash
aws logs tail /aws/ecs/cash-logix-backend-production --follow
```

### Check Service Status

```bash
aws ecs describe-services \
  --cluster cash-logix-production \
  --services cash-logix-backend-production
```

### Health Check

The application includes a health check endpoint at `/health` that returns:

```json
{
  "status": "OK",
  "message": "Cash Logix API is running",
  "arabic": "واجهة برمجة تطبيقات كاش لوجيكس تعمل بشكل طبيعي",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "production"
}
```

## Scaling

### Manual Scaling

```bash
aws ecs update-service \
  --cluster cash-logix-production \
  --service cash-logix-backend-production \
  --desired-count 3
```

### Auto Scaling

Configure auto-scaling policies in the ECS service or use Application Auto Scaling.

## Security Considerations

1. **Secrets Management**: All sensitive data stored in AWS Systems Manager Parameter Store
2. **Network Security**: Security groups restrict traffic to necessary ports only
3. **Container Security**: Non-root user in Docker container
4. **HTTPS**: SSL/TLS termination at Application Load Balancer
5. **IAM Roles**: Least privilege access for ECS tasks

## Troubleshooting

### Common Issues

1. **ECS Task Failing to Start**

   - Check CloudWatch logs for error messages
   - Verify environment variables are correctly set
   - Ensure MongoDB connection is accessible

2. **Load Balancer Health Checks Failing**

   - Verify health check endpoint is responding
   - Check security group rules allow traffic on port 5000
   - Ensure ECS tasks are running and healthy

3. **Image Pull Errors**
   - Verify ECR repository exists and image is pushed
   - Check ECS task execution role has ECR permissions
   - Ensure image tag matches task definition

### Debug Commands

```bash
# Check ECS service events
aws ecs describe-services --cluster cash-logix-production --services cash-logix-backend-production

# Check task definition
aws ecs describe-task-definition --task-definition cash-logix-backend-production

# Check CloudFormation stack events
aws cloudformation describe-stack-events --stack-name cash-logix-backend
```

## Cost Optimization

1. **Use Fargate Spot**: Configure capacity provider strategy for cost savings
2. **Right-size Resources**: Adjust CPU and memory based on actual usage
3. **Auto Scaling**: Scale down during low-traffic periods
4. **Log Retention**: Set appropriate CloudWatch log retention periods

## Cleanup

To remove all AWS resources:

```bash
# Delete CloudFormation stack
aws cloudformation delete-stack --stack-name cash-logix-backend

# Delete ECR repository
aws ecr delete-repository --repository-name cash-logix-backend --force

# Delete SSM parameters
aws ssm delete-parameter --name "/cash-logix/mongodb-uri"
aws ssm delete-parameter --name "/cash-logix/jwt-secret"
aws ssm delete-parameter --name "/cash-logix/email-user"
aws ssm delete-parameter --name "/cash-logix/email-pass"
```

## Support

For issues or questions:

1. Check CloudWatch logs for application errors
2. Review ECS service events for infrastructure issues
3. Verify all environment variables are correctly configured
4. Ensure all AWS services have proper permissions
