# Wellkept Secret Manager

> _Because you can trust a **wellkept** secret._


We often write code that requires multiple secrets to be initialized, and environment variables or .env files are often used to 
store them.

But passwords and sensitive secrets **should never be stored in plain text**. 

And we should **never write passwords on the command line**.

`wellkept` is a command-line tool to store secrets (i.e. sensitive name-value pairs) in password encrypted file-vaults, that 
can be safely shared in Dropbox or similar. The single password that's needed for each file-vault is the only sensitive secret 
that needs to be securely stored or communicated (for that use 1Password, KeePass or similar).

A file vault contains multiple secrets divided in groups called _"domains"_ that can be referred to with a short name.

Secrets of a given domain can be fed to programs that need them in the form of environment variables, by running such programs 
through `wellkept`.

Secrets can be edited via `wellkept` on the terminal, in a minimal nano-like text editor.

The passwords needed to decrypt file-vaults are stored in your system's keychain, so you only have to enter them once. 
On macOS it uses Keychain, on Linux the Secret Service API/libsecret, and on Windows the Credential Vault.


## Installation

You can install it globally:

    npm install -g wellkept

And update it with:

    npm update -g wellkept

Or you can run it directly with `npx`:

    npx wellkept ...

## Managing vaults

### list
You can always have an overview of what vaults are registered with the `list` command:

    ➜ wellkept list                                                                                                                                                                                        [22/05/26| 2:06PM]
    
    /Users/user/Dropbox/secrets-team-A.dat
        project1: 2 secrets
        project2: 1 secrets
    
    /Users/user/Dropbox/secrets-team-B.dat
        project3: 4 secrets

    /Users/user/Dropbox/newly-created-vault.dat
        No secrets

### create
You can create a new vault with the `create` command. You'll be asked to create the password to encrypt the vault. 
Choose a strong one and keep it safe in a tool like 1Password or KeePass. Once the vault has been created, it will already
be registered and appear among the others with the `list` command:

    ➜ wellkept create ~/Downloads/test.dat                                                                                                                                                                 [22/05/26| 2:10PM]
    Choose a password: ******
    Repeat password: *****
    Vault created

### register
If you already have a vault somewhere (maybe shared via Dropbox), you can `register` it in order to start using it:

    ➜ wellkept register ~/Downloads/test.dat                                                                                                                                                               [22/05/26| 2:21PM]
    Password: *****
    Vault registered

### deregister
When you don't need a vault anymore you can `deregister` it. Deregistering a vault simply removes the reference to it (along
with its password) from the system's keychain, but the actual encrypted file will remain where it is. You need to delete it
yourself if that's what you want.

    ➜ wellkept deregister ~/Downloads/test.dat                                                                                                                                                             [22/05/26| 2:19PM]
    Vault deregistered

## Editing secrets

### edit-vault
If you want to edit the contents of an entire vault, you can do so with the `edit-vault` command, by specifying the full
path to the vault file, as displayed in the `list` command. The actual editing will happen inside the terminal, in a simple
nano-like minimal text editor. This way no secret will be written to temporary files, but will remain strictly in memory.

    ➜ wellkept edit-vault ~/Downloads/test.dat

### edit
You can also edit a single domain with the `edit` command. The proper vault will be accessed, but only the secrets belonging
to the specified domain will be presented to be edited. The other secrets in the vault will be left intact.

    ➜ wellkept edit project1

## Migrating from envchain
If you are using `envchain` and want to migrate secrets to `wellkept`, you can easily do so by simply listing the envchain
namespaces and `wellkept` will create a new file-vault with the exported secrets, divided in domains matching the original
envchain namespaces. The new vault will be created just like with the `create` command, therefore you will be asked to enter
a password to encrypt it.

    ➜ envchain --list | sort | uniq
    project1
    project2
    project3

    ➜ wellkept import-envchain ~/Downloads/imported-envchain-secrets.dat project1 project2 project3
    Choose a password: *****
    Repeat password: *****
    Vault created

## Motivation

For a long time I've used [envchain](https://github.com/sorah/envchain), but secrets are stored in the system's keychain only,
so it's impossible to share them on multiple machines (like between my desktop and laptop) and very cumbersome to migrate them
to a new machine.

When it comes to secrets, I hold on to these strong tenets:
1. Never hard code a secret in code
2. Never store a secret in clear text on the filesystem
3. Never write secrets on the command line

There are many other tools out there that solve the basic need n.1, but many fail number 2 and number 3. Envchain was the only
one I liked so far, but because of the shortcomings above – and because it's fun – I'm rolling my own.


[//]: # (Started off using [this template]&#40;https://github.com/chriswells0/node-typescript-template&#41;.)
