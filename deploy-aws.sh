# AWS Deployment Scripts for Cash Logix Backend

## Prerequisites
- AWS CLI configured with appropriate permissions
- Docker installed and running
- Node.js 18+ installed
- ECR repository created

## Setup Instructions

### 1. Create ECR Repository
```bash
aws ecr create-repository --repository-name cash-logix-backend --region us-east-1
```

### 2. Configure AWS CLI
```bash
aws configure
# Enter your AWS Access Key ID, Secret Access Key, Region, and Output format
```

### 3. Set Environment Variables
```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=us-east-1
export ECR_REPOSITORY=cash-logix-backend
export IMAGE_TAG=latest
```

### 4. Build and Push Docker Image
```bash
# Get login token
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Build image
docker build -t $ECR_REPOSITORY:$IMAGE_TAG .

# Tag image
docker tag $ECR_REPOSITORY:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG

# Push image
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG
```

### 5. Deploy Infrastructure
```bash
# Deploy CloudFormation stack
aws cloudformation deploy \
  --template-file cloudformation-template.yaml \
  --stack-name cash-logix-backend \
  --parameter-overrides \
    Environment=production \
    VpcId=vpc-xxxxxxxxx \
    SubnetIds=subnet-xxxxxxxxx,subnet-yyyyyyyyy \
    CertificateArn=arn:aws:acm:us-east-1:xxxxxxxxx:certificate/xxxxxxxxx \
  --capabilities CAPABILITY_IAM
```

### 6. Update ECS Service
```bash
# Update ECS service to use new image
aws ecs update-service \
  --cluster cash-logix-production \
  --service cash-logix-backend-production \
  --force-new-deployment
```

## Environment Variables Setup

### Store secrets in AWS Systems Manager Parameter Store
```bash
# MongoDB URI
aws ssm put-parameter \
  --name "/cash-logix/mongodb-uri" \
  --value "mongodb+srv://username:password@cluster.mongodb.net/cashlogix" \
  --type "SecureString"

# JWT Secret
aws ssm put-parameter \
  --name "/cash-logix/jwt-secret" \
  --value "your-super-secure-jwt-secret" \
  --type "SecureString"

# Email credentials
aws ssm put-parameter \
  --name "/cash-logix/email-user" \
  --value "your-ses-smtp-username" \
  --type "SecureString"

aws ssm put-parameter \
  --name "/cash-logix/email-pass" \
  --value "your-ses-smtp-password" \
  --type "SecureString"
```

## Monitoring and Logs

### View logs
```bash
aws logs tail /aws/ecs/cash-logix-backend-production --follow
```

### Check service status
```bash
aws ecs describe-services \
  --cluster cash-logix-production \
  --services cash-logix-backend-production
```

## Scaling

### Update service desired count
```bash
aws ecs update-service \
  --cluster cash-logix-production \
  --service cash-logix-backend-production \
  --desired-count 3
```

## Cleanup

### Delete CloudFormation stack
```bash
aws cloudformation delete-stack --stack-name cash-logix-backend
```

### Delete ECR repository
```bash
aws ecr delete-repository --repository-name cash-logix-backend --force
```
