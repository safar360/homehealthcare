import 'package:flutter/material.dart';

import 'models.dart';
import 'services/supabase_service.dart';

class PortalLoginPage extends StatefulWidget {
  const PortalLoginPage({super.key, required this.backend});

  final SupabaseService backend;

  @override
  State<PortalLoginPage> createState() => _PortalLoginPageState();
}

class _PortalLoginPageState extends State<PortalLoginPage> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController(text: '');
  final _passwordController = TextEditingController(text: '');
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final session = await widget.backend.signIn(
        email: _emailController.text.trim(),
        password: _passwordController.text,
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => PortalDashboardPage(backend: widget.backend, session: session),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Operations portal login')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: Card(
            margin: const EdgeInsets.all(24),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Sign in as admin, manager or staff', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 20),
                    TextFormField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(labelText: 'Email'),
                      validator: (value) => (value == null || value.trim().isEmpty) ? 'Email is required' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _passwordController,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Password'),
                      validator: (value) => (value == null || value.isEmpty) ? 'Password is required' : null,
                    ),
                    const SizedBox(height: 20),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                      ),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _submitting ? null : _submit,
                        child: _submitting
                            ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Text('Continue to portal'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Use the same email/password created in Supabase Auth. A matching profile row with role=admin, manager or staff is required.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class PortalDashboardPage extends StatefulWidget {
  const PortalDashboardPage({super.key, required this.backend, required this.session});

  final SupabaseService backend;
  final PortalSession session;

  @override
  State<PortalDashboardPage> createState() => _PortalDashboardPageState();
}

class _PortalDashboardPageState extends State<PortalDashboardPage> {
  bool _loading = false;
  String? _error;
  List<LocationManager> _managers = const [];
  List<LocationStaffMember> _staff = const [];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final managers = await widget.backend.fetchManagers(accessToken: widget.session.accessToken);
      final staff = await widget.backend.fetchStaff(
        accessToken: widget.session.accessToken,
        citySlug: widget.session.profile.citySlug,
      );
      if (!mounted) return;
      setState(() {
        _managers = managers;
        _staff = staff;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = widget.session.profile;
    final roleTitle = profile.role.toUpperCase();

    return Scaffold(
      appBar: AppBar(
        title: Text('Portal • $roleTitle'),
        actions: [
          IconButton(
            tooltip: 'Sign out',
            onPressed: () => Navigator.of(context).pushAndRemoveUntil(
              MaterialPageRoute(builder: (_) => PortalLoginPage(backend: widget.backend)),
              (route) => false,
            ),
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadData,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Welcome ${profile.fullName}', style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    Text('Role: ${profile.role} • City: ${profile.citySlug ?? 'all'}'),
                    const SizedBox(height: 8),
                    Text('Email: ${profile.email ?? '-'}'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else ...[
              if (profile.role == 'admin' || profile.role == 'manager')
                _buildSection(
                  context,
                  title: 'Staff list',
                  subtitle: profile.role == 'manager' ? 'Visible for your location' : 'All active staff members',
                  child: _staff.isEmpty
                      ? const Text('No staff members found for this location yet.')
                      : Column(children: _staff.map((member) => ListTile(title: Text(member.fullName), subtitle: Text('${member.role} • ${member.citySlug ?? 'all'}'), trailing: Text(member.phoneNumber ?? '-'))).toList()),
                ),
              if (profile.role == 'admin')
                _buildSection(
                  context,
                  title: 'Managers',
                  subtitle: 'Location managers configured in the backend',
                  child: _managers.isEmpty
                      ? const Text('No managers configured yet.')
                      : Column(children: _managers.map((manager) => ListTile(title: Text(manager.fullName), subtitle: Text(manager.citySlug ?? 'all'), trailing: Text(manager.phoneNumber ?? '-'))).toList()),
                ),
              if (profile.role == 'staff')
                _buildSection(
                  context,
                  title: 'Assigned work',
                  subtitle: 'Staff view will be expanded when assignments are wired in.',
                  child: const Text('Orders and assignments will appear here after the assignment flow is connected.'),
                ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildSection(BuildContext context, {required String title, required String subtitle, required Widget child}) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }
}
