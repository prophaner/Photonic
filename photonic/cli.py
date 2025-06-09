"""
Command-line interface for Photonic.
"""
import os
import sys
import argparse
import logging
from pathlib import Path
from typing import List, Optional

from photonic.auth import PhotonicSession, AuthenticationError, CredentialsInvalidError, TokenCache
from photonic.config import log, get_default_download_dir, save_config, CREDENTIALS_FILE
from photonic.downloader import process_study, fetch_worklist

def main(args=None):
    """
    Main execution function.
    
    Args:
        args: Command line arguments (for testing)
        
    Returns:
        Exit code (0 for success, non-zero for errors)
    """
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="Photonic - QuickRad download automation")
    parser.add_argument("--download-dir", "-d", type=str, 
                        help="Directory to save downloaded files")
    parser.add_argument("--set-default-dir", "-s", action="store_true",
                        help="Save the specified download directory as default")
    parser.add_argument("--reset-credentials", "-r", action="store_true",
                        help="Reset stored credentials")
    parser.add_argument("--all", "-a", action="store_true",
                        help="Download all studies from the work-list")
    parser.add_argument("--count", "-c", type=int, default=1,
                        help="Number of studies to download (default: 1)")
    parser.add_argument("--study-uid", "-u", type=str, nargs="+",
                        help="Specific study instance UID(s) to download")
    parser.add_argument("--max-retries", "-m", type=int, default=3,
                        help="Maximum retry attempts for network errors (default: 3)")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Enable verbose logging")
    
    parsed_args = parser.parse_args(args)
    
    # Set log level based on verbose flag
    if parsed_args.verbose:
        log.setLevel(logging.DEBUG)
        log.debug("🔍  Verbose logging enabled")
    
    # Handle reset credentials
    if parsed_args.reset_credentials:
        log.info("🔄  Resetting credentials...")
        if CREDENTIALS_FILE.exists():
            CREDENTIALS_FILE.unlink()
            log.info("✅  Credentials file deleted")
        else:
            log.info("ℹ️   No credentials file found")
        
        TokenCache.clear()
        log.info("✅  Credential reset complete. Run script again to enter new credentials.")
        return 0
    
    # Handle download directory
    download_dir = None
    if parsed_args.download_dir:
        download_dir = Path(os.path.expanduser(parsed_args.download_dir))
        log.info("📂  Using download directory: %s", download_dir)
        
        # Save as default if requested
        if parsed_args.set_default_dir:
            save_config(download_dir=str(download_dir))
    else:
        download_dir = get_default_download_dir()
        log.info("📂  Using default download directory: %s", download_dir)
    
    # Ensure download directory exists
    download_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        api = PhotonicSession()
        
        # If specific study UIDs are provided
        if parsed_args.study_uid:
            log.info("🎯  Processing %d specific studies", len(parsed_args.study_uid))
            success_count = 0
            
            for i, study_uid in enumerate(parsed_args.study_uid, 1):
                log.info("📊  Processing study %d/%d", i, len(parsed_args.study_uid))
                
                # Create a minimal study dict
                study = {"study_instance_uid": study_uid, "patient_name": f"patient_{i}"}
                
                if process_study(api, study, download_dir, parsed_args.max_retries):
                    success_count += 1
            
            log.info("✅  Completed: %d/%d studies downloaded successfully", 
                    success_count, len(parsed_args.study_uid))
            return 0 if success_count == len(parsed_args.study_uid) else 1
        
        # Otherwise, fetch from work-list
        studies = fetch_worklist(api)
        if not studies:
            log.error("❌  No studies returned from work-list")
            return 1
        
        # Determine how many studies to process
        if parsed_args.all:
            studies_to_process = studies
            log.info("🔄  Processing all %d studies", len(studies_to_process))
        else:
            count = min(parsed_args.count, len(studies))
            studies_to_process = studies[:count]
            log.info("🔄  Processing %d studies", len(studies_to_process))
        
        # Process each study
        success_count = 0
        for i, study in enumerate(studies_to_process, 1):
            log.info("📊  Processing study %d/%d", i, len(studies_to_process))
            if process_study(api, study, download_dir, parsed_args.max_retries):
                success_count += 1
        
        log.info("✅  Completed: %d/%d studies downloaded successfully", 
                success_count, len(studies_to_process))
        return 0 if success_count == len(studies_to_process) else 1
        
    except CredentialsInvalidError as e:
        log.error("🚫  Authentication Error: %s", e)
        log.error("💡  To fix this:")
        log.error("    1. Delete credentials file: %s", CREDENTIALS_FILE)
        log.error("    2. Run the script again to enter new credentials")
        log.error("    3. Wait before retrying to avoid account lockout")
        return 2
    except AuthenticationError as e:
        log.error("🔐  Authentication failed: %s", e)
        return 2
    except KeyboardInterrupt:
        log.info("⏹️   Operation cancelled by user")
        return 0
    except Exception as e:
        log.error("❌  Error: %s", e)
        return 1

if __name__ == "__main__":
    sys.exit(main())